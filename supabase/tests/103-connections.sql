-- Conexiones automáticas (ADR-0022): permisos de usuarios, bóveda, cola, cubo de fichas e ingesta.
begin;
select plan(118);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('aser@example.test') as aser \gset
select tests.create_user('beto@example.test') as beto \gset

-- Ayudantes (se crean antes de cambiar de rol)
create function tests.flow(p_ref text, p_id text, p_on text, p_kind text, p_amount text, p_cur text default 'EUR')
returns jsonb language sql immutable as $$
  select jsonb_build_object('external_ref', p_ref, 'id', p_id, 'occurred_on', p_on, 'kind', p_kind,
                            'amount_minor', p_amount, 'currency', p_cur, 'description', 'Mov ' || p_id)
$$;
create function tests.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;
grant execute on function tests.flow(text, text, text, text, text, text), tests.as_service() to authenticated, anon;
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select public.create_invitation(:'sp', 'aser@example.test', 'advisor', 5::smallint) as t2 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'aser'); select public.accept_invitation(:'t2');
select tests.authenticate_as(:'beto'); select public.create_space('B') as sp_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Exchange', 'crypto', 'EUR') returning id as acc \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Otra', 'brokerage', 'EUR') returning id as acc2 \gset
select tests.authenticate_as(:'beto');
insert into public.accounts (space_id, name, kind, currency) values (:'sp_b'::uuid, 'Ajena', 'crypto', 'EUR') returning id as acc_b \gset
select tests.authenticate_as(:'alicia');

-- ---------------------------------------------------------------------------
-- Conexiones: altas y visibilidad
-- ---------------------------------------------------------------------------
insert into public.connections (space_id, kind, provider, created_by) values (:'sp', 'api', 'binance', :'alicia') returning id as cn \gset
select is((select status from public.connections where id = :'cn'::uuid), 'pending', 'una conexión nace pendiente');
select isnt((select sync_minute from public.connections where id = :'cn'::uuid), null, 'con un minuto de sincronización repartido');

select throws_ok(format($$insert into public.connections (space_id, kind, provider, created_by, status) values (%L, 'api', 'binance', %L, 'active')$$, :'sp', :'alicia'),
  '42501', null, 'no se puede dar de alta una conexión ya activa (estado fuera de las columnas permitidas)');
select throws_ok(format($$insert into public.connections (space_id, kind, provider, created_by) values (%L, 'api', 'binance', %L)$$, :'sp', :'beto'),
  '42501', null, 'la conexión se crea a nombre de quien la crea');
select throws_ok(format($$insert into public.connections (space_id, kind, provider, created_by) values (%L, 'psd2', 'binance', %L)$$, :'sp', :'alicia'),
  '23514', null, 'PSD2 solo con el agregador y las API con su proveedor');
select throws_ok(format($$update public.connections set status = 'active' where id = %L$$, :'cn'),
  '42501', null, 'un usuario no cambia el estado de una conexión');
select throws_ok(format($$delete from public.connections where id = %L$$, :'cn'), '42501', null, 'ni la borra');

select tests.authenticate_as(:'vic');
select is((select count(*)::int from public.connections), 1, 'solo lectura ve las conexiones del espacio');
select throws_ok(format($$insert into public.connections (space_id, kind, provider, created_by) values (%L, 'api', 'binance', %L)$$, :'sp', :'vic'),
  '42501', null, 'solo lectura no crea conexiones');
select tests.authenticate_as(:'aser');
select is((select count(*)::int from public.connections), 0, 'el asesor no ve las conexiones');
select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.connections), 0, 'otro espacio no las ve');
select throws_ok(format($$insert into public.connections (space_id, kind, provider, created_by) values (%L, 'api', 'binance', %L)$$, :'sp', :'beto'),
  '42501', null, 'ni crea conexiones en mi espacio');
select tests.as_anon();
select throws_ok($$select count(*) from public.connections$$, '42501', null, 'anon no lee conexiones');

-- ---------------------------------------------------------------------------
-- Cuentas vinculadas: integridad entre espacios
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alicia');
insert into public.connection_accounts (connection_id, space_id, account_id, external_ref) values (:'cn', :'sp', :'acc', 'spot');
select is((select count(*)::int from public.connection_accounts), 1, 'se vincula una cuenta propia');
select throws_ok(format($$insert into public.connection_accounts (connection_id, space_id, account_id, external_ref) values (%L, %L, %L, 'x')$$, :'cn', :'sp', :'acc_b'),
  '23503', null, 'no se vincula una cuenta de otro espacio (FK compuesta)');
select throws_ok(format($$insert into public.connection_accounts (connection_id, space_id, account_id, external_ref) values (%L, %L, %L, 'spot2')$$, :'cn', :'sp', :'acc'),
  '23505', null, 'una cuenta se alimenta de una sola referencia');
select tests.authenticate_as(:'vic');
select throws_ok(format($$insert into public.connection_accounts (connection_id, space_id, account_id, external_ref) values (%L, %L, %L, 'y')$$, :'cn', :'sp', :'acc2'),
  '42501', null, 'solo lectura no vincula cuentas');

-- ---------------------------------------------------------------------------
-- Funciones del servidor: nadie más puede ejecutarlas
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'alicia');
select throws_ok(format($$select public.put_connection_secret(%L, '\x00'::bytea, decode(repeat('00', 12), 'hex'), '\x00'::bytea, decode(repeat('00', 12), 'hex'), 1::smallint)$$, :'cn'),
  '42501', null, 'un usuario no guarda secretos');
select throws_ok(format($$select * from public.get_connection_secret(%L)$$, :'cn'), '42501', null, 'un usuario no lee secretos');
select throws_ok(format($$select public.activate_connection(%L)$$, :'cn'), '42501', null, 'un usuario no activa conexiones');
select throws_ok($$select * from public.claim_sync_jobs(5)$$, '42501', null, 'un usuario no reclama trabajos');
select throws_ok(format($$select * from public.get_connection_info(%L)$$, :'cn'), '42501', null, 'un usuario no lee la ficha del servidor');
select throws_ok(format($$select * from public.get_connection_accounts(%L)$$, :'cn'), '42501', null, 'un usuario no lee las cuentas vinculadas desde el servidor');
select throws_ok($$select public.schedule_due_syncs()$$, '42501', null, 'un usuario no programa sincronizaciones');
select throws_ok(format($$select public.ingest_sync(%L, '{}'::jsonb)$$, :'cn'), '42501', null, 'un usuario no ingiere datos');
select throws_ok($$select public.take_rate_tokens('x', 1, 1, 1)$$, '42501', null, 'un usuario no usa el cubo de fichas');
select tests.as_anon();
select throws_ok(format($$select public.request_sync(%L)$$, :'cn'), '42501', null, 'anon no pide sincronizaciones');

-- ---------------------------------------------------------------------------
-- Bóveda (servidor)
-- ---------------------------------------------------------------------------
select tests.as_service();
select public.put_connection_secret(:'cn', '\x0102030405060708090a0b0c0d0e0f1011'::bytea, decode(repeat('0a', 12), 'hex'),
  decode(repeat('0b', 40), 'hex'), decode(repeat('0c', 12), 'hex'), 1::smallint, 'huella-publica');
select is((select count(*)::int from public.get_connection_secret(:'cn')), 1, 'el servidor lee el secreto de una conexión pendiente');
select is((select provider from public.get_connection_secret(:'cn')), 'binance', 'y sabe de qué proveedor es');
select is((select status from public.get_connection_info(:'cn')), 'pending', 'la ficha del servidor trae el estado');
select is((select provider from public.get_connection_info(:'cn')), 'binance', 'el proveedor');
select is((select space_id from public.get_connection_info(:'cn')), :'sp'::uuid, 'y el espacio');
select is((select count(*)::int from public.get_connection_info('00000000-0000-4000-8000-000000000000')), 0, 'una conexión inexistente no devuelve nada');
select public.put_connection_secret(:'cn', '\x0102030405060708090a0b0c0d0e0f1022'::bytea, decode(repeat('0a', 12), 'hex'),
  decode(repeat('0b', 40), 'hex'), decode(repeat('0c', 12), 'hex'), 2::smallint, 'otra');
select is((select kek_version from public.get_connection_secret(:'cn')), 2::smallint, 'guardar de nuevo sustituye el secreto (rotación)');
select throws_ok(format($$select public.put_connection_secret(%L, '\x01'::bytea, decode(repeat('0a', 12), 'hex'), decode(repeat('0b', 40), 'hex'), decode(repeat('0c', 12), 'hex'), 1::smallint)$$, :'cn'),
  '23514', null, 'un secreto demasiado corto se rechaza');
select throws_ok(format($$select public.put_connection_secret(%L, '\x0102030405060708090a0b0c0d0e0f1011'::bytea, decode(repeat('0a', 11), 'hex'), decode(repeat('0b', 40), 'hex'), decode(repeat('0c', 12), 'hex'), 1::smallint)$$, :'cn'),
  '23514', null, 'el nonce debe tener 12 bytes');
select tests.as_postgres();
select is((select count(*)::int from private.connection_secrets), 1, 'queda un solo secreto por conexión');
select tests.authenticate_as(:'alicia');
select throws_ok($$select count(*) from private.connection_secrets$$, '42501', null, 'ningún usuario lee la tabla de secretos');

select tests.as_service();
select public.activate_connection(:'cn', now() + interval '90 days');
select is((select status from public.connections where id = :'cn'::uuid), 'active', 'se activa con credenciales');
select throws_ok(format($$select public.activate_connection(%L)$$, :'cn'), '23514', null, 'no se activa dos veces');
insert into public.connections (space_id, kind, provider, created_by) values (:'sp', 'api', 'binance', :'alicia') returning id as cn_empty \gset
select throws_ok(format($$select public.activate_connection(%L)$$, :'cn_empty'), '23514', null, 'sin credenciales no se activa');

-- ---------------------------------------------------------------------------
-- Cubo de fichas
-- ---------------------------------------------------------------------------
select is(public.take_rate_tokens('t:1', 2, 3, 1), 0, 'toma fichas de un cubo nuevo (lleno)');
select cmp_ok(public.take_rate_tokens('t:1', 2, 3, 1), '>', 0, 'si no hay suficientes devuelve cuánto esperar');
select is(public.take_rate_tokens('t:1', 1, 3, 1), 0, 'la espera anterior no consumió ninguna ficha');
select throws_ok($$select public.take_rate_tokens('t:2', 5, 3, 1)$$, '22023', null, 'pedir más que la capacidad se rechaza');
select throws_ok($$select public.take_rate_tokens('t:2', 0, 3, 1)$$, '22023', null, 'pedir cero fichas se rechaza');

-- ---------------------------------------------------------------------------
-- Cola: pedir, reclamar, cerrar
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'vic');
select throws_ok(format($$select public.request_sync(%L)$$, :'cn'), '42501', null, 'solo lectura no pide sincronizaciones');
select tests.authenticate_as(:'beto');
select throws_ok(format($$select public.request_sync(%L)$$, :'cn'), '42501', null, 'otro espacio no pide sincronizaciones');
select tests.authenticate_as(:'alicia');
select throws_ok(format($$select public.request_sync(%L)$$, :'cn_empty'), '23514', null, 'una conexión pendiente no se sincroniza');
select is((public.request_sync(:'cn') ->> 'queued'), 'true', 'pedir una sincronización la encola');
select is((public.request_sync(:'cn') ->> 'reason'), 'too_soon', 'pedirla otra vez enseguida se limita a una cada 15 minutos');
select tests.as_postgres();
update public.connections set last_requested_at = now() - interval '1 hour' where id = :'cn'::uuid;
select tests.authenticate_as(:'alicia');
select is((public.request_sync(:'cn') ->> 'reason'), 'already_queued', 'con una ya en cola no se duplica');

select tests.as_service();
create temp table claimed as select * from public.claim_sync_jobs(10);
select is((select count(*)::int from claimed), 1, 'el worker reclama el trabajo');
select is((select attempts from claimed), 1::smallint, 'con su primer intento');
select is((select provider from claimed), 'binance', 'y el proveedor');
select is((select count(*)::int from public.claim_sync_jobs(10)), 0, 'un trabajo en curso no se reclama dos veces');
select tests.as_postgres();
update private.sync_jobs set locked_until = now() - interval '1 minute';
select tests.as_service();
select is((select count(*)::int from public.claim_sync_jobs(10)), 1, 'un trabajo con el plazo vencido (worker caído) se recupera');
select tests.as_postgres();
select id as job1 from private.sync_jobs limit 1 \gset
select tests.as_service();
select public.finish_sync_job(:'job1'::bigint, 'retry', 'http_503', 120);
select tests.as_postgres();
select is((select state from private.sync_jobs where id = :'job1'::bigint), 'queued', 'un reintento vuelve a la cola');
select tests.as_service();
select tests.as_postgres();
select cmp_ok((select run_after from private.sync_jobs where id = :'job1'::bigint), '>', now() + interval '60 seconds', 'con retroceso');
select tests.as_service();
select is((select count(*)::int from public.claim_sync_jobs(10)), 0, 'y no se reclama antes de tiempo');
select throws_ok(format($$select public.finish_sync_job(%L, 'done')$$, :'job1'), '23514', null, 'solo se cierra un trabajo en curso');
select throws_ok(format($$select public.finish_sync_job(%L, 'raro')$$, :'job1'), '22023', null, 'el resultado debe ser conocido');
select tests.as_postgres();
update private.sync_jobs set run_after = now() - interval '1 second' where id = :'job1'::bigint;
select tests.as_service();
select is((select count(*)::int from public.claim_sync_jobs(10)), 1, 'cumplida la espera se vuelve a reclamar');
select public.finish_sync_job(:'job1'::bigint, 'done');
select tests.as_postgres();
select is((select state from private.sync_jobs where id = :'job1'::bigint), 'done', 'un trabajo hecho queda cerrado');
select tests.as_service();

-- Cinco intentos fallidos dejan la conexión pendiente de atención
select tests.as_postgres();
insert into private.sync_jobs (connection_id, space_id, kind, attempts, state) values (:'cn', :'sp', 'sync', 4, 'queued') returning id as job2 \gset
select tests.as_service();
select count(*) from public.claim_sync_jobs(10);
select public.finish_sync_job(:'job2'::bigint, 'retry', 'http_503');
select tests.as_postgres();
select is((select state from private.sync_jobs where id = :'job2'::bigint), 'failed', 'al quinto intento un reintento pasa a fallido');
select tests.as_service();
select is((select status from public.connections where id = :'cn'::uuid), 'needs_attention', 'y la conexión pide atención');
select is((select last_error_code from public.connections where id = :'cn'::uuid), 'http_503', 'con un código corto');
select public.activate_connection(:'cn');

-- ---------------------------------------------------------------------------
-- Programación diaria
-- ---------------------------------------------------------------------------
select tests.as_postgres();
delete from private.sync_jobs;
update public.connections set sync_minute = 0, last_success_at = null where id = :'cn'::uuid;
select tests.as_service();
select is(public.schedule_due_syncs(), 1, 'una conexión activa sin sincronizar hoy se programa');
select is(public.schedule_due_syncs(), 0, 'no se programa dos veces');
select tests.as_postgres();
delete from private.sync_jobs;
update public.connections set last_success_at = now() where id = :'cn'::uuid;
select tests.as_service();
select is(public.schedule_due_syncs(), 0, 'una sincronizada hoy no se programa');
select tests.as_postgres();
update public.connections set consent_expires_at = now() - interval '1 day', last_success_at = null where id = :'cn'::uuid;
select tests.as_service();
select is(public.schedule_due_syncs(), 0, 'una con el consentimiento vencido no se programa');
select is((select status from public.connections where id = :'cn'::uuid), 'expired', 'y pasa a caducada');
select public.activate_connection(:'cn', now() + interval '90 days');

-- ---------------------------------------------------------------------------
-- Ingesta
-- ---------------------------------------------------------------------------
select tests.as_service();
select jsonb_build_object(
  'flows', jsonb_build_array(
    tests.flow('spot', 'd1', '2026-10-01', 'contribution', '100000'),
    tests.flow('spot', 'w1', '2026-10-02', 'withdrawal', '20000'),
    tests.flow('spot', 'x1', '2026-10-03', 'dividend', '1500'),
    tests.flow('spot', 'd1', '2026-10-01', 'contribution', '100000')),
  'valuations', jsonb_build_array(jsonb_build_object('external_ref', 'spot', 'as_of', '2026-10-28', 'value_minor', '90000', 'currency', 'EUR'))
) as p1 \gset
select (public.ingest_sync(:'cn', :'p1'::jsonb)) as r1 \gset
select is((:'r1'::jsonb) ->> 'new', '3', 'la ingesta crea los movimientos nuevos');
select is((:'r1'::jsonb) ->> 'duplicate', '1', 'y detecta el repetido dentro del payload');
select tests.as_postgres();
select is((select count(*)::int from public.transactions where source = 'api'), 3, 'quedan tres movimientos con origen api');
select is((select balance_minor::int from public.account_cash_balances(:'sp') where account_id = :'acc'::uuid), 81500, 'el saldo suma aportación, retirada y dividendo');
select is((select sum(amount_minor)::int from public.transaction_legs), 0, 'las patas cuadran');
select results_eq(format($$select occurred_on::text, amount_minor::int from public.account_external_flows(%L) where account_id = %L order by occurred_on$$, :'sp', :'acc'),
  $$values ('2026-10-01', 100000), ('2026-10-02', -20000)$$, 'solo aportación y retirada alimentan el aportado frente a ganado');
select is((select value_minor::int from public.valuations where account_id = :'acc'::uuid and source = 'api'), 90000, 'guarda la valoración con origen api');
select is((select status from public.import_batches where file_kind = 'api' and account_id = :'acc'::uuid), 'committed', 'el lote consta como confirmado');
select is((select last_error_code from public.connections where id = :'cn'::uuid), null, 'la sincronización limpia el último error');
select isnt((select last_success_at from public.connections where id = :'cn'::uuid), null, 'y anota la última vez que fue bien');

select tests.as_service();
select is((public.ingest_sync(:'cn', :'p1'::jsonb) ->> 'new'), '0', 'el mismo payload no crea nada (idempotente)');
select (public.ingest_sync(:'cn', jsonb_build_object('flows', jsonb_build_array(
  tests.flow('spot', 'd1', '2026-10-01', 'contribution', '100000'),
  tests.flow('spot', 'd2', '2026-10-05', 'contribution', '5000')))) ) as r3 \gset
select is((:'r3'::jsonb) ->> 'new', '1', 'un payload solapado solo crea los movimientos nuevos');
select is((:'r3'::jsonb) ->> 'duplicate', '1', 'y reconoce el ya importado');
select tests.as_postgres();
select is((select count(*)::int from public.transactions where source = 'api'), 4, 'cuatro movimientos en total');

-- Una valoración manual del mismo día no se pisa; una de la API sí se actualiza
insert into public.valuations (space_id, account_id, as_of, value_minor, currency, source) values (:'sp', :'acc', '2026-10-27', 111, 'EUR', 'manual');
select tests.as_service();
select public.ingest_sync(:'cn', jsonb_build_object('valuations', jsonb_build_array(
  jsonb_build_object('external_ref', 'spot', 'as_of', '2026-10-27', 'value_minor', '222', 'currency', 'EUR'),
  jsonb_build_object('external_ref', 'spot', 'as_of', '2026-10-28', 'value_minor', '95000', 'currency', 'EUR'))));
select tests.as_postgres();
select is((select value_minor::int from public.valuations where account_id = :'acc'::uuid and as_of = '2026-10-27'), 111, 'la API no pisa un valor escrito a mano');
select is((select value_minor::int from public.valuations where account_id = :'acc'::uuid and as_of = '2026-10-28'), 95000, 'pero sí actualiza el suyo');

-- Rechazos: nada se escribe a medias
select tests.as_service();
select throws_ok(format($$select public.ingest_sync(%L, %L::jsonb)$$, :'cn', jsonb_build_object('flows', jsonb_build_array(tests.flow('otra', 'z1', '2026-10-01', 'contribution', '1')))),
  '23503', null, 'una cuenta no vinculada se rechaza');
select throws_ok(format($$select public.ingest_sync(%L, %L::jsonb)$$, :'cn', jsonb_build_object('flows', jsonb_build_array(tests.flow('spot', 'z2', '2026-10-01', 'contribution', '1', 'USD')))),
  '23514', null, 'otra moneda se rechaza (sale de la cuenta, no del payload)');
select throws_ok(format($$select public.ingest_sync(%L, %L::jsonb)$$, :'cn', jsonb_build_object('flows', jsonb_build_array(tests.flow('spot', 'z3', '2026-10-01', 'buy', '1')))),
  '22023', null, 'un tipo no permitido se rechaza');
select throws_ok(format($$select public.ingest_sync(%L, %L::jsonb)$$, :'cn', jsonb_build_object('flows', jsonb_build_array(tests.flow('spot', 'z4', '2026-10-01', 'contribution', '0')))),
  '22023', null, 'un importe cero se rechaza');
select throws_ok(format($$select public.ingest_sync(%L, %L::jsonb)$$, :'cn', jsonb_build_object('flows', jsonb_build_array(tests.flow('spot', 'z5', '2026-10-01', 'contribution', '-5')))),
  '22023', null, 'el importe llega en positivo');
select throws_ok(format($$select public.ingest_sync(%L, '[]'::jsonb)$$, :'cn'), '22023', null, 'el payload debe ser un objeto');
select throws_ok(format($$select public.ingest_sync(%L, '{"flows":{}}'::jsonb)$$, :'cn'), '22023', null, 'los movimientos deben ser una lista');
select throws_ok(format($$select public.ingest_sync(%L, %L::jsonb)$$, :'cn_empty', jsonb_build_object('flows', '[]'::jsonb)),
  '23514', null, 'una conexión no activa no ingiere');
select tests.as_postgres();
select is((select count(*)::int from public.transactions where source = 'api'), 4, 'los rechazos no dejaron movimientos');

-- ---------------------------------------------------------------------------
-- Revocar
-- ---------------------------------------------------------------------------
select tests.authenticate_as(:'vic');
select throws_ok(format($$select public.revoke_connection(%L)$$, :'cn'), '42501', null, 'solo lectura no revoca');
select tests.authenticate_as(:'beto');
select throws_ok(format($$select public.revoke_connection(%L)$$, :'cn'), '42501', null, 'otro espacio no revoca');
select tests.authenticate_as(:'alicia');
select public.revoke_connection(:'cn');
select is((select status from public.connections where id = :'cn'::uuid), 'revoked', 'quien escribe puede revocar');
select tests.as_postgres();
select is((select count(*)::int from private.connection_secrets where connection_id = :'cn'::uuid), 0, 'y se borra su secreto');
select is((select count(*)::int from private.sync_jobs where connection_id = :'cn'::uuid and state in ('queued', 'running')), 0, 'y sus trabajos pendientes');
select tests.authenticate_as(:'alicia');
select lives_ok(format($$select public.revoke_connection(%L)$$, :'cn'), 'revocar otra vez no falla');
select tests.as_service();
select throws_ok(format($$select public.ingest_sync(%L, '{}'::jsonb)$$, :'cn'), '23514', null, 'una conexión revocada no ingiere');
select is((select count(*)::int from public.get_connection_secret(:'cn')), 0, 'ni entrega secretos');
select tests.as_postgres();
select is((select count(*)::int from audit.events where action like 'connection.%' and space_id = :'sp'::uuid), 10, 'queda rastro en la auditoría, sin contenido');

-- ---------------------------------------------------------------------------
-- Segundo factor (regla 10): conectar o revocar exige AAL2 si la persona tiene MFA
-- ---------------------------------------------------------------------------
select tests.as_postgres();
insert into public.connections (space_id, kind, provider, created_by) values (:'sp', 'api', 'binance', :'alicia') returning id as cn_mfa \gset
select tests.authenticate_as(:'alicia');
select is(public.can_manage_connection(:'cn_mfa'), true, 'sin segundo factor activado, quien escribe puede gestionar');
select is(public.can_manage_connection('00000000-0000-4000-8000-000000000000'), false, 'una conexión inexistente no se puede gestionar');
select tests.authenticate_as(:'vic');
select is(public.can_manage_connection(:'cn_mfa'), false, 'solo lectura no puede gestionar');
select tests.as_postgres();
select tests.verify_mfa(:'alicia');
select tests.authenticate_as(:'alicia', 'aal1');
select is(public.can_manage_connection(:'cn_mfa'), false, 'con MFA activado y sesión aal1 no se puede gestionar');
select throws_ok(format($$select public.revoke_connection(%L)$$, :'cn_mfa'), '42501', null, 'ni revocar');
select tests.authenticate_as(:'alicia', 'aal2');
select is(public.can_manage_connection(:'cn_mfa'), true, 'con aal2 sí');

-- ---------------------------------------------------------------------------
-- Cuentas bancarias (PSD2): ingresos y gastos
-- ---------------------------------------------------------------------------
select tests.as_postgres();
insert into public.connections (space_id, kind, provider, created_by, status) values (:'sp', 'psd2', 'enable_banking', :'alicia', 'active') returning id as cn_bank \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Nómina', 'current', 'EUR') returning id as acc_bank \gset
insert into public.connection_accounts (connection_id, space_id, account_id, external_ref) values (:'cn_bank', :'sp', :'acc_bank', 'uid-1');
select tests.as_service();
select (public.ingest_sync(:'cn_bank', jsonb_build_object('flows', jsonb_build_array(
  tests.flow('uid-1', 'tx-1', '2026-10-01', 'income', '150000'),
  tests.flow('uid-1', 'tx-2', '2026-10-02', 'expense', '4530')))) ->> 'new') as r_bank \gset
select is(:'r_bank'::text, '2'::text, 'una cuenta bancaria ingiere ingresos y gastos');
select results_eq(format($$select external_ref from public.get_connection_accounts(%L)$$, :'cn_bank'), $$values ('uid-1')$$, 'el servidor conoce las cuentas vinculadas');
select is((select count(*)::int from public.get_connection_accounts('00000000-0000-4000-8000-000000000000')), 0, 'una conexión sin cuentas no devuelve nada');
select tests.as_postgres();
select is((select balance_minor::int from public.account_cash_balances(:'sp') where account_id = :'acc_bank'::uuid), 145470, 'el gasto resta y el ingreso suma');
select results_eq(format($$select kind, source from public.transactions t join public.transaction_legs l on l.transaction_id = t.id where l.account_id = %L and l.role = 'cash' order by t.occurred_on$$, :'acc_bank'),
  $$values ('income', 'api'), ('expense', 'api')$$, 'con sus tipos y origen api');
select is((select count(*)::int from public.account_external_flows(:'sp') where account_id = :'acc_bank'::uuid), 0, 'y no cuentan como aportado frente a ganado');

select * from finish();
rollback;

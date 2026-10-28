-- ADR-0008 / ADR-0021: vista previa, confirmación atómica, saldo inicial, reversión y descarte de
-- una importación; permisos y aislamiento entre espacios.
begin;
select plan(77);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('aser@example.test') as aser \gset
select tests.create_user('beto@example.test') as beto \gset

-- Ayudantes: huella de prueba y movimiento con una pata de efectivo y otra externa.
create function tests.fp(n int) returns text language sql immutable
as $$ select lpad(to_hex(n), 64, '0') $$;
create function tests.tx(p_row int, p_kind text, p_on text, p_acc uuid, p_cash text, p_ext text default null)
returns jsonb language sql
as $$
  select jsonb_build_object('row_index', p_row, 'kind', p_kind, 'occurred_on', p_on, 'description', 'Mov ' || p_row,
    'legs', jsonb_build_array(
      jsonb_build_object('role', 'cash', 'account_id', p_acc, 'amount_minor', p_cash, 'currency', 'EUR'),
      jsonb_build_object('role', 'external', 'account_id', null, 'amount_minor',
        coalesce(p_ext, (-p_cash::bigint)::text), 'currency', 'EUR')))
$$;
grant execute on function tests.fp(int), tests.tx(int, text, text, uuid, text, text) to authenticated, anon;

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select public.create_invitation(:'sp', 'aser@example.test', 'advisor', 5::smallint) as t2 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'aser'); select public.accept_invitation(:'t2');
select tests.authenticate_as(:'beto'); select public.create_space('B') as sp_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Corriente', 'current', 'EUR') returning id as acc \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Ahorro', 'savings', 'EUR') returning id as acc2 \gset

-- ---------------------------------------------------------------------------
-- Vista previa
-- ---------------------------------------------------------------------------
select jsonb_build_array(
  jsonb_build_object('row_index', 1, 'fingerprint', tests.fp(1)),
  jsonb_build_object('row_index', 2, 'fingerprint', tests.fp(2)),
  jsonb_build_object('row_index', 3, 'fingerprint', tests.fp(3), 'error_code', 'row.date_invalid'),
  jsonb_build_object('row_index', 4, 'fingerprint', tests.fp(1))) as rows1 \gset
select public.import_preview(:'sp', :'acc', 'csv', decode(repeat('a1', 32), 'hex'), :'sp' || '/a.csv', :'rows1'::jsonb) as pv1 \gset
select (:'pv1'::jsonb) ->> 'batch_id' as b1 \gset
select is((:'pv1'::jsonb) ->> 'status', 'previewed', 'la vista previa queda pendiente de confirmar');
select is((:'pv1'::jsonb) ->> 'new', '2', 'dos filas nuevas');
select is((:'pv1'::jsonb) ->> 'duplicate', '1', 'una fila repetida dentro del archivo cuenta como duplicada');
select is((:'pv1'::jsonb) ->> 'error', '1', 'una fila con código de error no se importa');
select results_eq(
  format($$select row_index, status from public.import_rows where batch_id = %L order by row_index$$, :'b1'),
  $$values (1, 'new'), (2, 'new'), (3, 'error'), (4, 'duplicate')$$,
  'cada fila queda clasificada');
select is((select row_count from public.import_batches where id = :'b1'::uuid), 4, 'el lote guarda el número de filas');
select is((select count(*)::int from public.transactions), 0, 'la vista previa no crea movimientos');

select tests.authenticate_as(:'vic');
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null, %L::jsonb)$$, :'sp', :'acc', :'rows1'),
  '42501', null, 'solo lectura no puede previsualizar');
select tests.authenticate_as(:'aser');
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null, %L::jsonb)$$, :'sp', :'acc', :'rows1'),
  '42501', null, 'el asesor no puede previsualizar');
select tests.authenticate_as(:'beto');
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null, %L::jsonb)$$, :'sp', :'acc', :'rows1'),
  '42501', null, 'otro espacio no puede previsualizar en el mío');
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null, %L::jsonb)$$, :'sp_b', :'acc', :'rows1'),
  '23503', null, 'la cuenta debe ser del espacio indicado');
select tests.as_anon();
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null, %L::jsonb)$$, :'sp', :'acc', :'rows1'),
  '42501', null, 'anon no puede ejecutar la vista previa');

select tests.authenticate_as(:'alicia');
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null, '[]'::jsonb)$$, :'sp', :'acc'),
  '22023', null, 'un archivo sin filas se rechaza');
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null, '{}'::jsonb)$$, :'sp', :'acc'),
  '22023', null, 'las filas deben ser un array');
select throws_ok(
  format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null,
    (select jsonb_agg(jsonb_build_object('row_index', g, 'fingerprint', tests.fp(g))) from generate_series(1, 5001) g))$$, :'sp', :'acc'),
  '22023', null, 'más de 5000 filas se rechazan');
select throws_ok(format($$select public.import_preview(%L, %L, 'csv', decode(repeat('a2', 32), 'hex'), null,
    '[{"row_index":1,"fingerprint":"abcd"}]'::jsonb)$$, :'sp', :'acc'),
  '23514', null, 'la huella debe ser de 32 bytes');
select is((select count(*)::int from public.import_batches), 1, 'los rechazos no dejan lotes a medias');

-- ---------------------------------------------------------------------------
-- Confirmación: validaciones
-- ---------------------------------------------------------------------------
select jsonb_build_array(tests.tx(1, 'expense', '2026-10-26', :'acc', '-300'),
                         tests.tx(2, 'income', '2026-10-27', :'acc', '150000')) as tx_ok \gset

select tests.authenticate_as(:'vic');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1', :'tx_ok'), '42501', null, 'solo lectura no confirma');
select tests.authenticate_as(:'beto');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1', :'tx_ok'), '42501', null, 'otro espacio no confirma mi lote');
select tests.authenticate_as(:'alicia');

select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(1, 'expense', '2026-10-26', :'acc2', '-300'))), '22023', null, 'la pata de efectivo debe ser de la cuenta del lote');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(1, 'buy', '2026-10-26', :'acc', '-300'))), '22023', null, 'solo se importan ingresos y gastos');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(1, 'income', '2026-10-26', :'acc', '-300'))), '22023', null, 'un ingreso no puede restar del efectivo');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(1, 'expense', '2026-10-26', :'acc', '300'))), '22023', null, 'un gasto no puede sumar al efectivo');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(1, 'expense', '2026-10-26', :'acc', '-300', '299'))), '22023', null, 'las patas deben cuadrar');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(1, 'expense', '2026-10-26', :'acc', '0', '0'))), '22023', null, 'un importe cero no se importa');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(jsonb_set(tests.tx(1, 'expense', '2026-10-26', :'acc', '-300'), '{legs}', '{}'::jsonb))), '22023', null, 'las patas deben ser un array');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(jsonb_set(tests.tx(1, 'expense', '2026-10-26', :'acc', '-300'), '{legs}',
    (tests.tx(1, 'expense', '2026-10-26', :'acc', '-300') -> 'legs') || (tests.tx(1, 'expense', '2026-10-26', :'acc', '-300') -> 'legs' -> 1)))),
  '22023', null, 'no se admiten patas de más');
select throws_ok(format($$select public.import_commit(%L, '{}'::jsonb)$$, :'b1'), '22023', null, 'los movimientos deben ser un array');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(3, 'expense', '2026-10-26', :'acc', '-300'))), '23514', null, 'una fila con error no se puede importar');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(4, 'expense', '2026-10-26', :'acc', '-300'))), '23514', null, 'una fila duplicada no se puede importar');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1',
  jsonb_build_array(tests.tx(1, 'expense', '2026-10-26', :'acc', '-300'), tests.tx(99, 'expense', '2026-10-26', :'acc', '-300'))),
  '23514', null, 'una fila inexistente anula toda la importación');
select is((select count(*)::int from public.transactions), 0, 'todo o nada: no queda ningún movimiento a medias');
select is((select count(*)::int from public.import_rows where batch_id = :'b1'::uuid and status = 'imported'), 0, 'ni filas marcadas como importadas');

-- ---------------------------------------------------------------------------
-- Confirmación: caso feliz
-- ---------------------------------------------------------------------------
select public.import_commit(:'b1', :'tx_ok'::jsonb) as cm1 \gset
select is((:'cm1'::jsonb) ->> 'imported', '2', 'se importan las dos filas nuevas');
select lives_ok('set constraints all immediate', 'los movimientos importados pasan la validación de cuadre');
set constraints all deferred;
select is((select count(*)::int from public.transactions where source = 'csv' and status = 'settled'), 2, 'dos movimientos liquidados con origen csv');
select is((select sum(amount_minor)::int from public.transaction_legs), 0, 'las patas suman cero');
select is((select balance_minor::int from public.account_cash_balances(:'sp') where account_id = :'acc'::uuid), 149700, 'el saldo de la cuenta refleja los movimientos');
select is((select count(*)::int from public.import_rows where batch_id = :'b1'::uuid and status = 'imported' and transaction_id is not null), 2, 'las filas importadas enlazan su movimiento');
select is((select status from public.import_batches where id = :'b1'::uuid), 'committed', 'el lote queda confirmado');
select isnt((select committed_at from public.import_batches where id = :'b1'::uuid), null, 'con su fecha de confirmación');
select is((select entered_by from public.transactions where source = 'csv' limit 1), :'alicia'::uuid, 'el autor es quien confirma');
select is((select kind from public.transactions where occurred_on = '2026-10-26'), 'expense', 'el gasto es un gasto');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b1', :'tx_ok'), '23514', null, 'un lote ya confirmado no se confirma otra vez');
select tests.as_postgres();
select is((select count(*)::int from audit.events where action = 'import.committed' and space_id = :'sp'::uuid), 1, 'la confirmación deja un evento de auditoría');
select tests.authenticate_as(:'alicia');

-- Idempotencia
select is(((public.import_preview(:'sp', :'acc', 'csv', decode(repeat('a1', 32), 'hex'), null, :'rows1'::jsonb)) ->> 'status'), 'already_imported',
  'el mismo archivo no se vuelve a importar');
select jsonb_build_array(
  jsonb_build_object('row_index', 1, 'fingerprint', tests.fp(1)),
  jsonb_build_object('row_index', 2, 'fingerprint', tests.fp(5))) as rows2 \gset
select public.import_preview(:'sp', :'acc', 'csv', decode(repeat('a2', 32), 'hex'), :'sp' || '/b.csv', :'rows2'::jsonb) as pv2 \gset
select (:'pv2'::jsonb) ->> 'batch_id' as b2 \gset
select is((:'pv2'::jsonb) ->> 'new', '1', 'un archivo que se solapa solo trae la fila nueva');
select is((:'pv2'::jsonb) ->> 'duplicate', '1', 'y reconoce la ya importada');

-- Última actividad de efectivo
select is((select last_on from public.account_last_activity(:'sp') where account_id = :'acc'::uuid), '2026-10-27'::date, 'último apunte de la cuenta');
select is((select last_on from public.account_last_activity(:'sp', '2026-10-26') where account_id = :'acc'::uuid), '2026-10-26'::date, 'último apunte hasta una fecha');
select public.create_transaction(:'sp', 'expense',  '2026-11-01',
  jsonb_build_array(
    jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '-1', 'currency', 'EUR'),
    jsonb_build_object('role', 'external', 'amount_minor', '1', 'currency', 'EUR')), 'pendiente', 'pending');
select is((select last_on from public.account_last_activity(:'sp') where account_id = :'acc'::uuid), '2026-10-27'::date, 'lo pendiente no cuenta como actividad');
select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.account_last_activity(:'sp')), 0, 'otro espacio no ve la actividad de mis cuentas');
select tests.authenticate_as(:'alicia');

-- ---------------------------------------------------------------------------
-- Saldo inicial, reversión y reimportación
-- ---------------------------------------------------------------------------
select public.import_commit(:'b2', jsonb_build_array(tests.tx(2, 'expense', '2026-10-28', :'acc', '-700')),
  '{"occurred_on": "2026-10-01", "amount_minor": "100000"}'::jsonb) as cm2 \gset
select is((:'cm2'::jsonb) ->> 'opening', 'true', 'se crea el saldo inicial pedido');
select is((select balance_minor::int from public.account_cash_balances(:'sp') where account_id = :'acc'::uuid), 249000, 'el saldo incluye saldo inicial y movimientos');
select is((select count(*)::int from public.transactions where kind = 'opening_balance'), 1, 'un solo saldo inicial');
select public.import_preview(:'sp', :'acc', 'csv', decode(repeat('a3', 32), 'hex'), null,
  jsonb_build_array(jsonb_build_object('row_index', 1, 'fingerprint', tests.fp(6)))) as pv3 \gset
select throws_ok(format($$select public.import_commit(%L, %L::jsonb, %L::jsonb)$$, (:'pv3'::jsonb) ->> 'batch_id',
  jsonb_build_array(tests.tx(1, 'expense', '2026-10-29', :'acc', '-5')), '{"occurred_on": "2026-09-01", "amount_minor": "5"}'),
  '23514', null, 'una cuenta no admite dos saldos iniciales');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb, %L::jsonb)$$, (:'pv3'::jsonb) ->> 'batch_id',
  jsonb_build_array(tests.tx(1, 'expense', '2026-10-29', :'acc2', '-5')), null),
  '22023', null, 'cualquier fallo de validación deja el lote sin tocar');
select lives_ok(format($$select public.import_discard(%L)$$, (:'pv3'::jsonb) ->> 'batch_id'), 'se descarta una vista previa sin confirmar');
select is((select count(*)::int from public.import_batches where id = ((:'pv3'::jsonb) ->> 'batch_id')::uuid), 0, 'el lote descartado desaparece');

select tests.authenticate_as(:'vic');
select throws_ok(format($$select public.import_revert(%L)$$, :'b2'), '42501', null, 'solo lectura no deshace importaciones');
select tests.authenticate_as(:'beto');
select throws_ok(format($$select public.import_revert(%L)$$, :'b2'), '42501', null, 'otro espacio no deshace mi importación');
select tests.authenticate_as(:'alicia');
select is(((public.import_revert(:'b2')) ->> 'removed'), '2', 'deshacer borra el movimiento y el saldo inicial');
select is((select balance_minor::int from public.account_cash_balances(:'sp') where account_id = :'acc'::uuid), 149700, 'el saldo vuelve a lo anterior');
select is((select status from public.import_batches where id = :'b2'::uuid), 'reverted', 'el lote queda deshecho');
select is((select status from public.import_rows where batch_id = :'b2'::uuid and row_index = 2), 'new', 'su fila vuelve a estar pendiente');
select public.import_preview(:'sp', :'acc', 'csv', decode(repeat('a2', 32), 'hex'), :'sp' || '/b.csv', :'rows2'::jsonb) as pv2b \gset
select is((:'pv2b'::jsonb) ->> 'batch_id', :'b2', 'el mismo archivo se puede volver a importar tras deshacerlo (mismo lote)');
select is((:'pv2b'::jsonb) ->> 'new', '1', 'con su fila nueva otra vez');
select lives_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b2', jsonb_build_array(tests.tx(2, 'expense', '2026-10-28', :'acc', '-700'))),
  'se vuelve a confirmar');
select tests.as_postgres();
update public.import_batches set committed_at = now() - interval '2 days' where id = :'b2'::uuid;
select tests.authenticate_as(:'alicia');
select throws_ok(format($$select public.import_revert(%L)$$, :'b2'), '23514', null, 'pasadas 24 h no se deshace');

-- Si un movimiento del lote se revirtió a mano, no se borra en bloque.
select public.reverse_transaction((select transaction_id from public.import_rows where batch_id = :'b1'::uuid and row_index = 1));
select throws_ok(format($$select public.import_revert(%L)$$, :'b1'), '23514', null, 'no se deshace un lote con movimientos ya revertidos');
select throws_ok(format($$select public.import_discard(%L)$$, :'b1'), '23514', null, 'una importación confirmada no se descarta');

-- ---------------------------------------------------------------------------
-- Dos vistas previas con la misma fila: solo una puede confirmarse
-- ---------------------------------------------------------------------------
select (public.import_preview(:'sp', :'acc', 'csv', decode(repeat('b1', 32), 'hex'), null,
  jsonb_build_array(jsonb_build_object('row_index', 1, 'fingerprint', tests.fp(30)))) ->> 'batch_id') as bx \gset
select (public.import_preview(:'sp', :'acc', 'csv', decode(repeat('b2', 32), 'hex'), null,
  jsonb_build_array(jsonb_build_object('row_index', 1, 'fingerprint', tests.fp(30)))) ->> 'batch_id') as by \gset
select lives_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'bx', jsonb_build_array(tests.tx(1, 'expense', '2026-10-30', :'acc', '-1'))), 'la primera se confirma');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'by', jsonb_build_array(tests.tx(1, 'expense', '2026-10-30', :'acc', '-1'))),
  '23505', null, 'la segunda choca con la huella ya importada');
select is((select status from public.import_batches where id = :'by'::uuid), 'previewed', 'y queda sin confirmar');
select is((select count(*)::int from public.import_rows where batch_id = :'by'::uuid and status = 'imported'), 0, 'sin filas importadas');

-- Un descarte limpia el lote y sus filas
select lives_ok(format($$select public.import_discard(%L)$$, :'by'), 'se descarta la vista previa conflictiva');
select is((select count(*)::int from public.import_rows where batch_id = :'by'::uuid), 0, 'sus filas se borran en cascada');

select * from finish();
rollback;

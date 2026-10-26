-- ADR-0009: auditoría sin PII, solo inserción, encadenada por espacio y verificable.
begin;
select plan(14);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset
select tests.authenticate_as(:'alicia');
select public.create_space('Familia') as space \gset
select public.create_invitation(:'space', 'eva@example.test', 'viewer');
select tests.authenticate_as(:'beto');
select public.create_space('Otra') as other \gset

select tests.as_postgres();
select ok((select count(*) >= 3 from audit.events where space_id = :'space'), 'se registran creación de espacio, alta de miembro e invitación');
select is((select count(*)::int from audit.events where metadata::text like '%@%' or entity_id like '%@%'), 0, 'la auditoría no contiene correos');
select is((select count(*)::int from audit.events where actor_hash = decode(replace(:'alicia', '-', ''), 'hex')), 0, 'el actor está seudonimizado');
select is(audit.verify_chain(:'space'), null::bigint, 'la cadena del espacio está íntegra');
select is((select count(*)::int from audit.verify_all()), 0, 'ninguna cadena rota');
select is((select count(*)::int from audit.events where space_id = :'space' and prev_hash is null), 1, 'cada espacio tiene su propia cadena (un solo inicio)');

select tests.authenticate_as(:'alicia');
select throws_ok('select * from audit.events', '42501', null, 'los usuarios no leen la auditoría directamente');
select throws_ok($$select audit.log_event('x', 'y', null, null)$$, '42501', null, 'los usuarios no pueden escribir eventos');
select throws_ok($$select audit.purge_older_than(interval '0 seconds')$$, '42501', null, 'los usuarios no pueden purgar');

select tests.as_postgres();
select throws_ok('update audit.events set action = $$falso$$', '42501', 'audit.events es de solo inserción', 'ni el propietario puede modificar eventos');
select throws_ok('delete from audit.events', '42501', 'audit.events es de solo inserción', 'ni borrar eventos fuera de la retención');

-- La retención borra el inicio de la cadena y la verificación lo tolera (el primer evento fija el ancla).
select pg_sleep(0.01);
select audit.purge_older_than(now() - (select occurred_at from audit.events where space_id = :'space' order by id offset 1 limit 1)) >= 1 as purged \gset
select ok(:'purged', 'la purga por retención borra eventos antiguos');
select is(audit.verify_chain(:'space'), null::bigint, 'la cadena sigue verificando tras purgar el inicio');

-- Una manipulación con privilegios de superusuario rompe la cadena y se detecta.
alter table audit.events disable trigger audit_events_immutable;
update audit.events set action = 'manipulado' where id = (select max(id) from audit.events where space_id = :'space');
select isnt(audit.verify_chain(:'space'), null::bigint, 'verify_chain detecta la manipulación');

select * from finish();
rollback;

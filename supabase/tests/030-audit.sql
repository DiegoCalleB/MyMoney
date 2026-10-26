-- ADR-0009: auditoría sin PII, solo inserción, encadenada y verificable.
begin;
select plan(8);

select tests.create_user('ana@example.test') as ana \gset
select tests.authenticate_as(:'ana');
select public.create_space('Familia') as space \gset
select public.create_invitation(:'space', 'eva@example.test', 'viewer');

select tests.as_postgres();
select ok((select count(*) >= 3 from audit.events where space_id = :'space'), 'se registran creación de espacio, alta de miembro e invitación');
select is((select count(*)::int from audit.events where metadata::text like '%@%' or entity_id like '%@%'), 0, 'la auditoría no contiene correos');
select is((select count(*)::int from audit.events where actor_hash = decode(replace(:'ana', '-', ''), 'hex')), 0, 'el actor está seudonimizado');
select is(audit.verify_chain(), null::bigint, 'la cadena de hashes está íntegra');

select tests.authenticate_as(:'ana');
select throws_ok('select * from audit.events', '42501', null, 'los usuarios no leen la auditoría directamente');
select throws_ok($$select audit.log_event('x', 'y', null, null)$$, '42501', null, 'los usuarios no pueden escribir eventos');

select tests.as_postgres();
select throws_ok('update audit.events set action = $$falso$$', '42501', 'audit.events es de solo inserción', 'ni el propietario puede modificar eventos');

-- Una manipulación con privilegios de superusuario rompe la cadena y se detecta.
alter table audit.events disable trigger audit_events_immutable;
update audit.events set action = 'manipulado' where id = (select min(id) from audit.events where space_id = :'space');
select isnt(audit.verify_chain(), null::bigint, 'verify_chain detecta la manipulación');

select * from finish();
rollback;

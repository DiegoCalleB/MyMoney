-- ADR-0021: cargos marcados como revisados («ya lo reconozco»).
begin;
select plan(9);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'beto');
select public.create_space('B') as sp_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Cuenta', 'current', 'EUR') returning id as acc \gset
select public.create_transaction(:'sp', 'expense', '2026-10-01', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '-999', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '999', 'currency', 'EUR'))) as tx \gset

select lives_ok(
  format($$insert into public.reviewed_movements (space_id, transaction_id, rule_id) values (%L, %L, 'unusual_amount')$$, :'sp', :'tx'),
  'un editor marca un cargo como revisado');
select is((select entered_by from public.reviewed_movements limit 1), :'alicia'::uuid, 'quién lo marcó lo fija el trigger');
select throws_ok(
  format($$insert into public.reviewed_movements (space_id, transaction_id, rule_id) values (%L, %L, 'unusual_amount')$$, :'sp', :'tx'),
  '23505', null, 'no se marca dos veces la misma regla');
select throws_ok(
  format($$insert into public.reviewed_movements (space_id, transaction_id, rule_id) values (%L, %L, 'otra')$$, :'sp', :'tx'),
  '23514', null, 'la regla es de una lista cerrada');
select throws_ok(
  format($$insert into public.reviewed_movements (space_id, transaction_id, rule_id) values (%L, %L, 'unusual_amount')$$, :'sp_b', :'tx'),
  null, null, 'no se puede marcar un movimiento de otro espacio (clave compuesta)');
select throws_ok(
  $$update public.reviewed_movements set rule_id = 'possible_duplicate'$$,
  '42501', null, 'una marca no se edita');

select tests.authenticate_as(:'vic');
select is((select count(*)::int from public.reviewed_movements), 1, 'un lector las ve');
select throws_ok(
  format($$insert into public.reviewed_movements (space_id, transaction_id, rule_id) values (%L, %L, 'recurring_change')$$, :'sp', :'tx'),
  '42501', null, 'un lector no puede marcar');

select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.reviewed_movements), 0, 'otro espacio no ve las marcas');

select * from finish();
rollback;

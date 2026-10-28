-- ADR-0021: aportaciones y retiradas externas por cuenta.
begin;
select plan(8);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select tests.authenticate_as(:'beto');
select public.create_space('B') as sp_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Fondo', 'fund_holding', 'EUR') returning id as acc \gset

select public.create_transaction(:'sp', 'contribution', '2024-01-10', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-100000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '100000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'contribution', '2024-01-10', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-5000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '5000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'withdrawal', '2025-06-01', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '-20000', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '20000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'expense', '2025-07-01', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '-999', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '999', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'contribution', '2025-08-01', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-7000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '7000', 'currency', 'EUR')), 'pendiente', 'pending');

select results_eq(
  format($$select occurred_on::text, amount_minor::int from public.account_external_flows(%L) where account_id = %L order by occurred_on$$, :'sp', :'acc'),
  $$values ('2024-01-10', 105000), ('2025-06-01', -20000)$$,
  'agrega por fecha, incluye retiradas y deja fuera gastos y lo pendiente');
select is((select count(*)::int from public.account_external_flows(:'sp', '2024-12-31')), 1, 'hasta una fecha solo cuentan los anteriores');
select is((select count(*)::int from public.account_external_flows(:'sp', '2023-12-31')), 0, 'antes de la primera aportación no hay flujos');

select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.account_external_flows(:'sp')), 0, 'otro espacio no ve los flujos');
select is((select count(*)::int from public.account_external_flows(:'sp_b')), 0, 'su propio espacio no tiene ninguno');
select tests.as_anon();
select throws_ok(format($$select * from public.account_external_flows(%L)$$, :'sp'), '42501', null, 'anon no puede ejecutarla');
select tests.authenticate_as(:'alicia');
select is((select count(distinct account_id)::int from public.account_external_flows(:'sp')), 1, 'la dueña ve la cuenta con flujos');
select is((select sum(amount_minor)::int from public.account_external_flows(:'sp')), 85000, 'aportado neto: 1.050 − 200 = 850 €');

select * from finish();
rollback;

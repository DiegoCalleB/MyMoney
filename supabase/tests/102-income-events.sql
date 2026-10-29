-- Calendario de cobros: dividendos e intereses por cuenta, fecha y tipo.
begin;
select plan(8);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset

create function tests.income(p_sp uuid, p_acc uuid, p_kind text, p_on text, p_amount text, p_status text default 'settled') returns uuid
language sql as $$
  select public.create_transaction(p_sp, p_kind, p_on::date, jsonb_build_array(
    jsonb_build_object('role', 'external', 'amount_minor', (-p_amount::bigint)::text, 'currency', 'EUR'),
    jsonb_build_object('role', 'cash', 'account_id', p_acc, 'amount_minor', p_amount, 'currency', 'EUR')),
    null, p_status)
$$;
grant execute on function tests.income(uuid, uuid, text, text, text, text) to authenticated;

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select tests.authenticate_as(:'beto');
select public.create_space('B') as sp_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Bróker', 'brokerage', 'EUR') returning id as acc \gset


select tests.income(:'sp', :'acc', 'dividend', '2026-03-15', '500');
select tests.income(:'sp', :'acc', 'dividend', '2026-03-15', '250');
select tests.income(:'sp', :'acc', 'interest', '2026-03-20', '100');
select tests.income(:'sp', :'acc', 'dividend', '2026-04-01', '-50');
select tests.income(:'sp', :'acc', 'dividend', '2026-05-01', '999', 'pending');
select public.create_transaction(:'sp', 'contribution', '2026-01-10', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-100000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '100000', 'currency', 'EUR')));

select results_eq(
  format($$select occurred_on::text, kind, amount_minor::int from public.account_income_events(%L) order by occurred_on, kind$$, :'sp'),
  $$values ('2026-03-15', 'dividend', 750), ('2026-03-20', 'interest', 100), ('2026-04-01', 'dividend', -50)$$,
  'agrega por fecha y tipo, admite correcciones negativas y deja fuera aportaciones y pendientes');
select is((select count(*)::int from public.account_income_events(:'sp', '2026-03-16')), 1, 'hasta una fecha solo cuentan los anteriores');
select is((select count(*)::int from public.account_income_events(:'sp', '2025-12-31')), 0, 'antes del primer cobro no hay nada');
select is((select min(currency) from public.account_income_events(:'sp')), 'EUR', 'lleva la moneda de la pata');

select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.account_income_events(:'sp')), 0, 'otro espacio no ve los cobros');
select is((select count(*)::int from public.account_income_events(:'sp_b')), 0, 'su propio espacio no tiene ninguno');
select tests.as_anon();
select throws_ok(format($$select * from public.account_income_events(%L)$$, :'sp'), '42501', null, 'anon no puede ejecutarla');
select tests.authenticate_as(:'alicia');
select is((select count(*)::int from public.account_income_events(:'sp')), 3, 'el propietario sí los ve');

select * from finish();
rollback;

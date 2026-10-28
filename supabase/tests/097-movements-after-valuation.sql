-- ADR-0021: movimientos posteriores a la última valoración de una cuenta.
begin;
select plan(9);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select tests.authenticate_as(:'beto');
select public.create_space('B') as sp_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Corriente', 'current', 'EUR') returning id as acc \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Sin valorar', 'current', 'EUR') returning id as acc2 \gset
insert into public.valuations (space_id, account_id, as_of, value_minor, currency) values
  (:'sp', :'acc', '2026-10-01', 100000, 'EUR'),
  (:'sp', :'acc', '2026-10-10', 120000, 'EUR');

select public.create_transaction(:'sp', 'expense', '2026-10-05', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '-1000', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '1000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'expense', '2026-10-12', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '-2500', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '2500', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'income', '2026-10-15', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-10000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '10000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'expense', '2026-10-20', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '-300', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '300', 'currency', 'EUR')), 'pendiente', 'pending');

select is((select delta_minor::int from public.account_movements_after_valuation(:'sp') where account_id = :'acc'::uuid),
  7500, 'solo cuentan los movimientos posteriores a la última valoración (10-oct) y liquidados');
select is((select last_on from public.account_movements_after_valuation(:'sp') where account_id = :'acc'::uuid),
  '2026-10-15'::date, 'devuelve la fecha del último movimiento contado');
select is((select delta_minor::int from public.account_movements_after_valuation(:'sp', '2026-10-13') where account_id = :'acc'::uuid),
  -2500, 'hasta una fecha, solo los anteriores a ella');
select is((select delta_minor::int from public.account_movements_after_valuation(:'sp', '2026-10-05') where account_id = :'acc'::uuid),
  -1000, 'con una fecha anterior se usa la valoración vigente entonces (1-oct)');
select is((select count(*)::int from public.account_movements_after_valuation(:'sp') where account_id = :'acc2'::uuid),
  0, 'una cuenta sin valoración no aparece: su saldo es el del libro');

select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.account_movements_after_valuation(:'sp')), 0, 'otro espacio no ve los movimientos');
select is((select count(*)::int from public.account_movements_after_valuation(:'sp_b')), 0, 'y su propio espacio no tiene ninguno');
select tests.as_anon();
select throws_ok(format($$select * from public.account_movements_after_valuation(%L)$$, :'sp'), '42501', null, 'anon no puede ejecutarla');
select tests.authenticate_as(:'alicia');
select is((select count(*)::int from public.account_movements_after_valuation(:'sp')), 1, 'la dueña ve una cuenta con movimientos posteriores');

select * from finish();
rollback;

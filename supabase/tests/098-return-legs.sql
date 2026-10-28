-- ADR-0022: patas del libro para la rentabilidad.
begin;
select plan(9);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
select tests.authenticate_as(:'beto');
select public.create_space('B') as sp_b \gset
select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Corriente', 'current', 'EUR') returning id as cur \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Fondo', 'fund_holding', 'EUR') returning id as fund \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Otra', 'current', 'EUR') returning id as other \gset

select public.create_transaction(:'sp', 'contribution', '2026-10-01', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-100000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'cur', 'amount_minor', '100000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'internal_transfer', '2026-10-05', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'cur', 'amount_minor', '-40000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'fund', 'amount_minor', '40000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'income', '2026-10-06', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-5000', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'other', 'amount_minor', '5000', 'currency', 'EUR')));
select public.create_transaction(:'sp', 'expense', '2026-10-20', jsonb_build_array(
  jsonb_build_object('role', 'cash', 'account_id', :'fund', 'amount_minor', '-300', 'currency', 'EUR'),
  jsonb_build_object('role', 'external', 'amount_minor', '300', 'currency', 'EUR')), 'pendiente', 'pending');

select is((select count(*)::int from public.return_legs(:'sp')), 6,
  'sin filtro devuelve las patas de los movimientos liquidados (3 movimientos × 2 patas)');
select is((select count(*)::int from public.return_legs(:'sp', array[:'fund'::uuid])), 2,
  'filtrando por cuenta, solo los movimientos que la tocan, con todas sus patas');
select is((select string_agg(distinct kind, ',') from public.return_legs(:'sp', array[:'fund'::uuid])), 'internal_transfer',
  'incluye el tipo del movimiento');
select is((select count(*)::int from public.return_legs(:'sp', array[:'cur'::uuid], '2026-10-03')), 2,
  'hasta una fecha, solo los anteriores');
select is((select count(*)::int from public.return_legs(:'sp') where role = 'external'), 2,
  'las patas externas vienen con sus movimientos');
select is((select array_agg(occurred_on order by occurred_on) from public.return_legs(:'sp', array[:'cur'::uuid])),
  array['2026-10-01', '2026-10-01', '2026-10-05', '2026-10-05']::date[], 'ordenadas por fecha');

select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.return_legs(:'sp')), 0, 'otro espacio no ve las patas');
select tests.as_anon();
select throws_ok(format($$select * from public.return_legs(%L)$$, :'sp'), '42501', null, 'anon no puede ejecutarla');
select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.return_legs(:'sp_b')), 0, 'su propio espacio no tiene movimientos');

select * from finish();
rollback;

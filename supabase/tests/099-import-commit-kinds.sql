-- Importación de brókeres y exchanges (ADR-0008, ADR-0021): import_commit admite aportaciones,
-- retiradas, dividendos e intereses con sus signos, y sigue rechazando compras y ventas.
begin;
select plan(17);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('beto@example.test') as beto \gset

create function tests.fp(n int) returns text language sql immutable
as $$ select lpad(to_hex(n), 64, '0') $$;
create function tests.tx(p_row int, p_kind text, p_on text, p_acc uuid, p_cash text)
returns jsonb language sql
as $$
  select jsonb_build_object('row_index', p_row, 'kind', p_kind, 'occurred_on', p_on, 'description', 'Mov ' || p_row,
    'legs', jsonb_build_array(
      jsonb_build_object('role', 'cash', 'account_id', p_acc, 'amount_minor', p_cash, 'currency', 'EUR'),
      jsonb_build_object('role', 'external', 'account_id', null, 'amount_minor', (-p_cash::bigint)::text, 'currency', 'EUR')))
$$;
grant execute on function tests.fp(int), tests.tx(int, text, text, uuid, text) to authenticated, anon;

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Bróker', 'brokerage', 'EUR') returning id as acc \gset

select public.import_preview(:'sp', :'acc', 'csv', decode(repeat('b1', 32), 'hex'), null,
  (select jsonb_agg(jsonb_build_object('row_index', g, 'fingerprint', tests.fp(g))) from generate_series(1, 6) g)) as pv \gset
select (:'pv'::jsonb) ->> 'batch_id' as b \gset

-- Signos incoherentes con el tipo
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'contribution', '2026-10-01', :'acc', '-1000'))), '22023', null, 'una aportación no puede restar del efectivo');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'withdrawal', '2026-10-01', :'acc', '1000'))), '22023', null, 'una retirada no puede sumar al efectivo');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'dividend', '2026-10-01', :'acc', '-1000'))), '22023', null, 'un dividendo no puede restar del efectivo');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'interest', '2026-10-01', :'acc', '-1000'))), '22023', null, 'un interés no puede restar del efectivo');

-- Tipos que siguen sin importarse: no cruzan el borde del espacio o no son de extracto
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'buy', '2026-10-01', :'acc', '-1000'))), '22023', null, 'una compra no se importa');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'internal_transfer', '2026-10-01', :'acc', '-1000'))), '22023', null, 'un traspaso no se importa');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'opening_balance', '2026-10-01', :'acc', '1000'))), '22023', null, 'el saldo inicial solo se crea con p_opening');

-- Caso feliz con los cuatro tipos nuevos
select public.import_commit(:'b', jsonb_build_array(
  tests.tx(1, 'contribution', '2026-10-01', :'acc', '100000'),
  tests.tx(2, 'withdrawal', '2026-10-02', :'acc', '-20000'),
  tests.tx(3, 'dividend', '2026-10-03', :'acc', '1234'),
  tests.tx(4, 'interest', '2026-10-04', :'acc', '567'))) as cm \gset
select is((:'cm'::jsonb) ->> 'imported', '4', 'se importan los cuatro movimientos');
set constraints all immediate;
set constraints all deferred;
select results_eq(
  $$select kind, source from public.transactions order by occurred_on$$,
  $$values ('contribution', 'csv'), ('withdrawal', 'csv'), ('dividend', 'csv'), ('interest', 'csv')$$,
  'los tipos quedan guardados con origen csv');
select is((select balance_minor::int from public.account_cash_balances(:'sp') where account_id = :'acc'::uuid), 81801, 'el saldo suma todos los flujos');
select results_eq(
  format($$select occurred_on::text, amount_minor::int from public.account_external_flows(%L) order by occurred_on$$, :'sp'),
  $$values ('2026-10-01', 100000), ('2026-10-02', -20000)$$,
  'solo aportaciones y retiradas alimentan el aportado frente a ganado');
select is((select sum(amount_minor)::int from public.transaction_legs), 0, 'las patas suman cero');

-- Reversión y aislamiento
select is((public.import_revert(:'b') ->> 'removed'), '4', 'la importación se deshace entera');
select is((select count(*)::int from public.transactions), 0, 'sin movimientos tras deshacer');

select tests.authenticate_as(:'beto');
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'contribution', '2026-10-01', :'acc', '100'))), '42501', null, 'otro espacio no puede confirmar mi lote');
select tests.as_anon();
select throws_ok(format($$select public.import_commit(%L, %L::jsonb)$$, :'b',
  jsonb_build_array(tests.tx(1, 'contribution', '2026-10-01', :'acc', '100'))), '42501', null, 'anon no puede confirmar');
select tests.authenticate_as(:'alicia');
select is((select status from public.import_batches where id = :'b'::uuid), 'reverted', 'el lote consta como deshecho');

select * from finish();
rollback;

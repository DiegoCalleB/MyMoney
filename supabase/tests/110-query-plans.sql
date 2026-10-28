-- Rendimiento: las políticas deben compilar a un InitPlan (una sola evaluación por consulta) y las
-- consultas calientes deben usar índices con volumen realista.
begin;
select plan(5);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.authenticate_as(:'alicia');
select public.create_space('Perf') as sp \gset
-- 50 cuentas y 20.000 movimientos de 2 patas (40.000 patas) con fechas repartidas en 5 años
select tests.as_postgres();
with a as (
  insert into public.accounts (space_id, name, kind, currency)
  select :'sp', 'C' || g, 'current', 'EUR' from generate_series(1, 50) g returning id)
select array_agg(id) as accs from a \gset
select (:'accs'::uuid[])[1] as acc \gset
insert into public.transactions (space_id, kind, occurred_on)
  select :'sp', 'adjustment', date '2022-01-01' + (g % 1800) from generate_series(1, 20000) g;
insert into public.transaction_legs (transaction_id, space_id, role, account_id, amount_minor, currency)
  select t.id, t.space_id, 'cash', (:'accs'::uuid[])[1 + (row_number() over (order by t.id) % 50)::int], 100, 'EUR'
  from public.transactions t where t.space_id = :'sp';
insert into public.transaction_legs (transaction_id, space_id, role, amount_minor, currency)
  select t.id, t.space_id, 'external', -100, 'EUR' from public.transactions t where t.space_id = :'sp';
analyze public.transactions;
analyze public.transaction_legs;
set constraints all immediate;

select tests.authenticate_as(:'alicia');
create function pg_temp.plan_text(q text) returns text language plpgsql as $f$
declare r text; t text := '';
begin
  for r in execute 'explain ' || q loop t := t || r || E'\n'; end loop;
  return t;
end $f$;

select alike(pg_temp.plan_text('select * from public.accounts'), '%InitPlan%',
  'la política de lectura se evalúa como InitPlan (no una vez por fila)');
select alike(pg_temp.plan_text(format('select * from public.transaction_legs where space_id = %L and account_id = %L', :'sp', :'acc')),
  '%transaction_legs_account_idx%', 'las patas de una cuenta se leen por su índice');
select unalike(pg_temp.plan_text(format('select * from public.transactions where space_id = %L order by occurred_on desc limit 50', :'sp')),
  '%Sort%', 'el historial paginado usa el índice por fecha (sin ordenar toda la tabla)');
select is((select count(*)::int from public.account_cash_balances(:'sp')), 50, 'el saldo agregado se calcula en el servidor con 40.000 patas');
select is((select balance_minor from public.account_cash_balances(:'sp') where account_id = :'acc'::uuid), 40000::bigint, 'y es exacto (400 movimientos de 1,00 €)');

select * from finish();
rollback;

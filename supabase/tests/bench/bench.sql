\timing off
\set QUIET on
-- Carga: 1 espacio, 20 cuentas, 100.000 movimientos de 2 patas (200.000 patas), 5 años de fechas.
select set_config('request.jwt.claims', '', false);
insert into auth.users (email) values ('bench@example.test');
select id as u from auth.users limit 1 \gset
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u', 'email', 'bench@example.test', 'role', 'authenticated', 'aal', 'aal1')::text, false);
select public.create_space('Bench') as sp \gset
reset role;
\timing on
begin;
with a as (insert into public.accounts (space_id, name, kind, currency)
           select :'sp', 'C' || g, 'current', 'EUR' from generate_series(1, 20) g returning id)
select array_agg(id) as accs from a \gset
insert into public.transactions (space_id, kind, occurred_on)
  select :'sp', 'adjustment', date '2022-01-01' + (g % 1800) from generate_series(1, 100000) g;
insert into public.transaction_legs (transaction_id, space_id, role, account_id, amount_minor, currency)
  select t.id, t.space_id, 'cash', (:'accs'::uuid[])[1 + (row_number() over (order by t.id) % 20)::int], 100, 'EUR'
  from public.transactions t;
insert into public.transaction_legs (transaction_id, space_id, role, amount_minor, currency)
  select t.id, t.space_id, 'external', -100, 'EUR' from public.transactions t;
-- Tras una carga masiva conviene ANALYZE antes de validar (sin estadísticas el planificador yerra).
analyze public.transactions; analyze public.transaction_legs; analyze public.accounts;
\echo 'Commit de 100.000 movimientos / 200.000 patas (300.000 validaciones diferidas):'
commit;
\timing off
analyze;

set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u', 'email', 'bench@example.test', 'role', 'authenticated', 'aal', 'aal1')::text, false);
\echo
\echo '=== 200.000 patas, 1 espacio, usuario autenticado con RLS ==='

\echo '1) Saldos de todas las cuentas (agregado en servidor)'
explain (analyze, timing off, summary on, costs off) select * from public.account_cash_balances(:'sp');

\echo '2) Patas de una cuenta (índice cubriente)'
explain (analyze, timing off, summary on, costs off) select * from public.transaction_legs where space_id = :'sp' and account_id = (:'accs'::uuid[])[1];

\echo '3) Historial paginado: últimos 50 movimientos'
explain (analyze, timing off, summary on, costs off) select * from public.transactions where space_id = :'sp' order by occurred_on desc, id limit 50;

-- Comparación: política "ingenua" que llama a una función por fila frente al patrón de arrays.
reset role;
create table public.bench_naive (like public.transaction_legs including all);
insert into public.bench_naive select * from public.transaction_legs;
alter table public.bench_naive enable row level security;
create policy naive on public.bench_naive for select to authenticated using (private.can_read(space_id));
grant select on public.bench_naive to authenticated;
create table public.bench_array (like public.transaction_legs including all);
insert into public.bench_array select * from public.transaction_legs;
alter table public.bench_array enable row level security;
create policy arr on public.bench_array for select to authenticated using (space_id = any ((select private.readable_space_ids())::uuid[]));
grant select on public.bench_array to authenticated;
analyze;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'u', 'email', 'bench@example.test', 'role', 'authenticated', 'aal', 'aal1')::text, false);
\echo
\echo '4) Contar 200.000 filas con política ingenua (private.can_read(space_id) por fila)'
explain (analyze, timing off, summary on, costs off) select count(*) from public.bench_naive;
\echo '5) Contar 200.000 filas con el patrón de arrays (InitPlan, una evaluación)'
explain (analyze, timing off, summary on, costs off) select count(*) from public.bench_array;

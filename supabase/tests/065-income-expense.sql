-- Control de ingresos y gastos: categorías, división de gastos, reembolsos, totales, presupuestos,
-- recurrentes y reglas. Los traspasos y las inversiones nunca cuentan como ingreso ni gasto.
begin;
select plan(40);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('Hogar') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as tok \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'tok');
select tests.authenticate_as(:'beto');
select public.create_space('Otro') as sp_b \gset
select public.seed_default_categories(:'sp_b');
select id as cat_b from public.categories where space_id = :'sp_b' and name = 'Alimentación' \gset

select tests.authenticate_as(:'vic');
select throws_ok(format($$select public.seed_default_categories(%L)$$, :'sp'), '42501', null, 'solo lectura no crea categorías iniciales');

select tests.authenticate_as(:'alicia');
select is(public.seed_default_categories(:'sp'), 18, 'se crean 18 categorías iniciales (4 de ingresos y 14 de gastos)');
select is(public.seed_default_categories(:'sp'), 0, 'la semilla es idempotente');
select is((select count(*)::int from public.categories where space_id = :'sp' and essential), 7, 'siete categorías de gasto básico (base del colchón)');
select is((select count(*)::int from public.categories where space_id = :'sp' and name ~* 'salud|sanidad|farmac|donaci|iglesia|sindicat|partido|religi'), 0,
  'ninguna categoría inicial revela datos de categoría especial');

select id as food from public.categories where space_id = :'sp' and name = 'Alimentación' \gset
select id as home from public.categories where space_id = :'sp' and name = 'Hogar y reparaciones' \gset
select id as housing from public.categories where space_id = :'sp' and name = 'Vivienda' \gset
select id as salary from public.categories where space_id = :'sp' and name = 'Nómina' \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Cuenta corriente', 'current', 'EUR') returning id as bank \gset

-- Gasto dividido en dos categorías
select lives_ok(format($$select public.create_transaction(%L, 'expense', '2026-01-10', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',%L,'amount_minor',-10000,'currency','EUR'),
  jsonb_build_object('role','external','category_id',%L,'amount_minor',8000,'currency','EUR'),
  jsonb_build_object('role','external','category_id',%L,'amount_minor',2000,'currency','EUR')))$$, :'sp', :'bank', :'food', :'home'),
  'un gasto de 100 € se divide en 80 € de alimentación y 20 € de hogar');
-- Nómina
select lives_ok(format($$select public.create_transaction(%L, 'income', '2026-01-28', jsonb_build_array(
  jsonb_build_object('role','external','category_id',%L,'amount_minor',-200000,'currency','EUR'),
  jsonb_build_object('role','cash','account_id',%L,'amount_minor',200000,'currency','EUR')))$$, :'sp', :'salary', :'bank'),
  'una nómina de 2.000 € entra como ingreso');
-- Reembolso en alimentación
select public.create_transaction(:'sp', 'expense', '2026-01-12', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',:'bank','amount_minor',500,'currency','EUR'),
  jsonb_build_object('role','external','category_id',:'food','amount_minor',-500,'currency','EUR'))) as refund \gset
select ok(:'refund' is not null, 'un reembolso es un gasto negativo en su categoría');

-- Coherencia de categorías
select throws_ok(format($$select public.create_transaction(%L, 'expense', '2026-01-10', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',%L,'amount_minor',-100,'currency','EUR'),
  jsonb_build_object('role','external','category_id',%L,'amount_minor',100,'currency','EUR')))$$, :'sp', :'bank', :'salary'),
  '23514', null, 'un gasto no puede usar una categoría de ingresos');
select throws_ok(format($$select public.create_transaction(%L, 'expense', '2026-01-10', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',%L,'category_id',%L,'amount_minor',-100,'currency','EUR'),
  jsonb_build_object('role','external','amount_minor',100,'currency','EUR')))$$, :'sp', :'bank', :'food'),
  '23514', null, 'la categoría solo cuelga de la pata externa');
select throws_ok(format($$select public.create_transaction(%L, 'expense', '2026-01-10', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',%L,'amount_minor',-100,'currency','EUR'),
  jsonb_build_object('role','external','category_id',%L,'amount_minor',100,'currency','EUR')))$$, :'sp', :'bank', :'cat_b'),
  '23503', null, 'no se puede usar una categoría de otro espacio');

-- Totales por categoría
select results_eq(
  format($$select category_id, flow, amount_minor from public.category_totals(%L, '2026-01-01', '2026-01-31') order by flow, amount_minor$$, :'sp'),
  format($$values (%L::uuid, 'expense', 2000::bigint), (%L::uuid, 'expense', 7500::bigint), (%L::uuid, 'income', 200000::bigint)$$, :'home', :'food', :'salary'),
  'alimentación 75,00 € (80 − 5 reembolsados), hogar 20,00 € y nómina 2.000,00 €');
select results_eq(
  format($$select to_char(month, 'YYYY-MM-DD'), income_minor, expense_minor from public.monthly_cashflow(%L, '2026-01-01', '2026-03-31')$$, :'sp'),
  $$values ('2026-01-01', 200000::bigint, 9500::bigint)$$,
  'flujo mensual de enero: ingresos 2.000 € y gastos 95 €');

-- Lo que NO es ingreso ni gasto
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Bróker', 'brokerage', 'EUR') returning id as broker \gset
select public.create_transaction(:'sp', 'internal_transfer', '2026-01-15', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',:'bank','amount_minor',-50000,'currency','EUR'),
  jsonb_build_object('role','cash','account_id',:'broker','amount_minor',50000,'currency','EUR')));
select public.create_transaction(:'sp', 'contribution', '2026-01-16', jsonb_build_array(
  jsonb_build_object('role','external','amount_minor',-30000,'currency','EUR'),
  jsonb_build_object('role','cash','account_id',:'broker','amount_minor',30000,'currency','EUR')));
select results_eq(
  format($$select income_minor, expense_minor from public.monthly_cashflow(%L, '2026-01-01', '2026-01-31')$$, :'sp'),
  $$values (200000::bigint, 9500::bigint)$$,
  'traspasos entre cuentas y aportaciones a inversión no cuentan como gasto ni ingreso');

-- Pendientes, periodo y sin categoría
select public.create_transaction(:'sp', 'expense', '2026-01-20', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',:'bank','amount_minor',-1000,'currency','EUR'),
  jsonb_build_object('role','external','amount_minor',1000,'currency','EUR')), 'Pendiente de cargo', 'pending');
select public.create_transaction(:'sp', 'expense', '2026-02-05', jsonb_build_array(
  jsonb_build_object('role','cash','account_id',:'bank','amount_minor',-3000,'currency','EUR'),
  jsonb_build_object('role','external','amount_minor',3000,'currency','EUR')), 'Sin categoría');
select is((select expense_minor from public.monthly_cashflow(:'sp', '2026-01-01', '2026-01-31')), 9500::bigint, 'un gasto pendiente no cuenta por defecto');
select is((select expense_minor from public.monthly_cashflow(:'sp', '2026-01-01', '2026-01-31', true)), 10500::bigint, 'y sí si se pide incluir pendientes');
select is((select expense_minor from public.monthly_cashflow(:'sp', '2026-02-01', '2026-02-28')), 3000::bigint, 'los gastos se agrupan por su mes natural');
select is((select amount_minor from public.category_totals(:'sp', '2026-02-01', '2026-02-28') where category_id is null), 3000::bigint, 'un gasto sin categoría aparece con categoría nula');

-- Reversión de un gasto con categoría: neto cero en esa categoría
select public.reverse_transaction((select transaction_id from public.transaction_legs where category_id = :'home' limit 1));
select is((select coalesce(sum(amount_minor), 0)::bigint from public.category_totals(:'sp', '2026-01-01', '2026-12-31') where category_id = :'home'), 0::bigint, 'revertir un gasto lo anula también en su categoría');

-- Jerarquía y reglas de categorías
select lives_ok(format($$insert into public.categories (space_id, name, kind, parent_id) values (%L, 'Alquiler', 'expense', %L)$$, :'sp', :'housing'), 'una subcategoría cuelga de una categoría');
select throws_ok(format($$insert into public.categories (space_id, name, kind, parent_id) values (%L, 'Nieta', 'expense', (select id from public.categories where name = 'Alquiler' and space_id = %L))$$, :'sp', :'sp'),
  '23514', null, 'solo dos niveles de categorías');
select throws_ok(format($$insert into public.categories (space_id, name, kind, parent_id) values (%L, 'Ingreso hijo', 'income', %L)$$, :'sp', :'housing'),
  '23514', null, 'una subcategoría hereda el tipo de su padre');
select throws_ok(format($$update public.categories set kind = 'income' where id = %L$$, :'food'), '42501', null, 'el tipo de una categoría no se cambia');
select throws_ok(format($$insert into public.categories (space_id, name, kind, essential) values (%L, 'Extra', 'income', true)$$, :'sp'), '23514', null, 'solo los gastos pueden ser básicos');
select throws_ok(format($$insert into public.categories (space_id, name, kind) values (%L, 'Alimentación', 'expense')$$, :'sp'), '23505', null, 'el nombre es único por tipo');
select lives_ok(format($$update public.categories set archived_at = now() where id = %L$$, :'home'), 'una categoría se archiva sin perder su historial');
select throws_ok(format($$delete from public.categories where id = %L$$, :'food'), '23503', null, 'no se borra una categoría con movimientos');

-- Presupuestos
select lives_ok(format($$insert into public.category_budgets values (%L, %L, '2026-01-01', 45000, 'EUR')$$, :'food', :'sp'), 'presupuesto mensual de 450 € para alimentación');
select throws_ok(format($$insert into public.category_budgets values (%L, %L, '2026-01-15', 45000, 'EUR')$$, :'food', :'sp'), '23514', null, 'la vigencia empieza el día 1 del mes');
select throws_ok(format($$insert into public.category_budgets values (%L, %L, '2026-01-01', 1, 'EUR')$$, :'food', :'sp'), '23505', null, 'un solo presupuesto por categoría y mes de inicio');
select lives_ok(format($$insert into public.category_budgets values (%L, %L, '2026-07-01', 50000, 'EUR')$$, :'food', :'sp'), 'un presupuesto posterior sustituye al anterior a partir de su mes');

-- Recurrentes y reglas
select lives_ok(format($$insert into public.recurring_rules (space_id, name, kind, amount_minor, currency, account_id, category_id, frequency, day_of_month, start_on)
  values (%L, 'Nómina', 'income', 200000, 'EUR', %L, %L, 'monthly', 28, '2026-01-01')$$, :'sp', :'bank', :'salary'), 'ingreso recurrente mensual');
select throws_ok(format($$insert into public.recurring_rules (space_id, name, kind, amount_minor, currency, frequency, start_on, end_on)
  values (%L, 'Mal', 'expense', 100, 'EUR', 'monthly', '2026-02-01', '2026-01-01')$$, :'sp'), '23514', null, 'un recurrente no termina antes de empezar');
select throws_ok(format($$insert into public.recurring_rules (space_id, name, kind, amount_minor, currency, frequency, start_on)
  values (%L, 'Cero', 'expense', 0, 'EUR', 'monthly', '2026-01-01')$$, :'sp'), '23514', null, 'el importe de un recurrente es positivo');
select lives_ok(format($$insert into public.categorization_rules (space_id, pattern, category_id) values (%L, 'MERCADONA', %L)$$, :'sp', :'food'), 'regla "contiene MERCADONA ⇒ alimentación"');
select throws_ok(format($$insert into public.categorization_rules (space_id, pattern, category_id) values (%L, 'MERCADONA', %L)$$, :'sp', :'food'), '23505', null, 'una regla no se duplica');
select throws_ok(format($$insert into public.categorization_rules (space_id, pattern, category_id) values (%L, 'X', %L)$$, :'sp', :'cat_b'), '23503', null, 'una regla no apunta a categorías de otro espacio');

-- Permisos de solo lectura
select tests.authenticate_as(:'vic');
select is((select count(*)::int from public.category_budgets), 2, 'solo lectura ve los presupuestos');
select throws_ok(format($$insert into public.categories (space_id, name, kind) values (%L, 'Intruso', 'expense')$$, :'sp'), '42501', null, 'pero no crea categorías');
select is((select count(*)::int from public.category_totals(:'sp', '2026-01-01', '2026-01-31')), 3, 've los totales por categoría de su espacio');

select * from finish();
rollback;

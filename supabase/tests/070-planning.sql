-- Planificación: invariantes de sumas, avisos (nivel 3 prohibido), eventos, ISIN, perfil y permisos.
begin;
select plan(44);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('aser@example.test') as aser \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('España') as sp \gset
select public.create_space('Portugal', 'household', 'PT') as sp_pt \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select public.create_invitation(:'sp', 'aser@example.test', 'advisor', 10::smallint) as t2 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'aser'); select public.accept_invitation(:'t2');
select tests.authenticate_as(:'beto'); select public.create_space('Otro') as sp_b \gset

select tests.authenticate_as(:'alicia');
insert into public.persons (space_id, display_name, kind) values (:'sp', 'Adulto de prueba', 'adult') returning id as p1 \gset
insert into public.persons (space_id, display_name, kind, birth_year) values (:'sp', 'Menor de prueba', 'minor', 2018) returning id as p2 \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Cuenta', 'current', 'EUR') returning id as acc \gset
insert into public.accounts (space_id, name, kind, currency, scope) values (:'sp', 'Cuenta de menor', 'savings', 'EUR', 'external') returning id as acc_ext \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Hipoteca', 'mortgage', 'EUR') returning id as mort \gset
insert into public.assets (space_id, kind, name, currency, asset_class, isin) values (:'sp', 'etf', 'ETF', 'EUR', 'equity', 'IE00B4L5Y983') returning id as etf \gset

-- Cuentas: externa, pasivo generado, no se borran con movimientos
select is((select scope from public.accounts where id = :'acc_ext'), 'external', 'una cuenta puede marcarse como dato externo (fuera del patrimonio del hogar)');
select is((select is_liability from public.accounts where id = :'mort'), true, 'is_liability se deriva del tipo de cuenta');
select throws_ok(
  format($$insert into public.loan_terms (account_id, space_id, principal_minor, rate_type, annual_rate, term_months, start_on) values (%L, %L, 100000, 'fixed', 0.03, 300, '2026-01-01')$$, :'acc', :'sp'),
  '23514', null, 'las condiciones de préstamo solo cuelgan de cuentas de deuda');
select lives_ok(
  format($$insert into public.loan_terms (account_id, space_id, principal_minor, rate_type, annual_rate, term_months, start_on) values (%L, %L, 100000, 'fixed', 0.03, 300, '2026-01-01')$$, :'mort', :'sp'),
  'y sí de una hipoteca');

-- Titularidad: suma exacta de 10000 pb
select lives_ok(format($q$do $b$ begin
  insert into public.account_holders (account_id, person_id, space_id, role, share_bps) values (%L, %L, %L, 'holder', 10000);
  insert into public.account_holders (account_id, person_id, space_id, role) values (%L, %L, %L, 'beneficiary');
  set constraints all immediate; end $b$$q$, :'acc_ext', :'p1', :'sp', :'acc_ext', :'p2', :'sp'),
  'titular al 100 % y beneficiario sin porcentaje');
select throws_ok(format($q$do $b$ begin
  insert into public.account_holders (account_id, person_id, space_id, role, share_bps) values (%L, %L, %L, 'holder', 6000);
  set constraints all immediate; end $b$$q$, :'acc', :'p1', :'sp'),
  '23514', null, 'los titulares que no suman 10000 pb se rechazan');
select throws_ok(format($$insert into public.account_holders (account_id, person_id, space_id, role) values (%L, %L, %L, 'holder')$$, :'acc', :'p1', :'sp'),
  '23514', null, 'un titular exige porcentaje');

-- Activos: ISIN
select is(private.is_valid_isin('US0378331005'), true, 'ISIN válido (Apple)');
select is(private.is_valid_isin('DE000BAY0017'), true, 'ISIN válido (Bayer)');
select is(private.is_valid_isin('US0378331006'), false, 'dígito de control erróneo');
select is(private.is_valid_isin('us0378331005'), false, 'formato erróneo (minúsculas)');
select throws_ok(format($$insert into public.assets (space_id, kind, name, currency, asset_class, isin) values (%L, 'etf', 'Mal', 'EUR', 'equity', 'IE00B4L5Y984')$$, :'sp'),
  '23514', null, 'un ISIN con dígito de control erróneo se rechaza al insertar');
select throws_ok(format($$insert into public.assets (space_id, kind, name, currency, asset_class, isin) values (%L, 'etf', 'Dup', 'EUR', 'equity', 'IE00B4L5Y983')$$, :'sp'),
  '23505', null, 'el ISIN es único por espacio');
select throws_ok(format($$insert into public.assets (space_id, kind, name, currency, asset_class, equity_weight_bps) values (%L, 'etf', 'X', 'EUR', 'equity', 5000)$$, :'sp'),
  '23514', null, 'el peso en renta variable solo aplica a activos mixtos');

-- Sumas de pesos
insert into public.investment_plans (space_id, name, total_minor, currency, start_on, status) values (:'sp', 'Plan', 2100000, 'EUR', '2026-10-27', 'active') returning id as plan \gset
insert into public.planned_operations (space_id, plan_id, kind, planned_on, amount_minor, currency, target_account_id) values (:'sp', :'plan', 'buy', '2026-10-27', 700000, 'EUR', :'acc') returning id as op \gset
select lives_ok(format($q$do $b$ begin
  insert into public.planned_operation_allocations (operation_id, space_id, label, weight_bps) values (%L, %L, 'Renta variable global', 8000), (%L, %L, 'Emergentes', 2000);
  set constraints all immediate; end $b$$q$, :'op', :'sp', :'op', :'sp'), 'un reparto 80/20 suma 10000 pb');
select throws_ok(format($q$do $b$ begin
  insert into public.planned_operation_allocations (operation_id, space_id, label, weight_bps) values (%L, %L, 'Solo una parte', 9000);
  set constraints all immediate; end $b$$q$, :'op', :'sp'), '23514', null, 'un reparto que no suma 10000 pb se rechaza');
select throws_ok(format($$update public.planned_operations set transaction_id = gen_random_uuid() where id = %L$$, :'op'),
  '23514', null, 'una operación solo enlaza una transacción cuando está hecha');
select throws_ok(format($$update public.planned_operations set status = 'done', transaction_id = gen_random_uuid() where id = %L$$, :'op'),
  '23503', null, 'y esa transacción debe existir en el mismo espacio');
select throws_ok(format($$insert into public.planned_operation_allocations (operation_id, space_id, weight_bps) values (%L, %L, 10000)$$, :'op', :'sp'),
  '23514', null, 'una asignación necesita activo o etiqueta');

insert into public.model_portfolios (space_id, name, ter_bps) values (:'sp', 'Cartera A', 41) returning id as port \gset
select lives_ok(format($q$do $b$ begin
  insert into public.model_portfolio_weights values (%L, %L, 'asset_class', 'equity', 7000), (%L, %L, 'asset_class', 'fixed_income', 3000);
  set constraints all immediate; end $b$$q$, :'port', :'sp', :'port', :'sp'), 'composición de cartera que suma 10000 pb');
select throws_ok(format($q$do $b$ begin
  insert into public.model_portfolio_weights values (%L, %L, 'region', 'world', 6000);
  set constraints all immediate; end $b$$q$, :'port', :'sp'), '23514', null, 'composición que no suma 10000 pb se rechaza');
select throws_ok(format($$update public.model_portfolios set worst_drawdown_bps = 3500 where id = %L$$, :'port'),
  '23514', null, 'una caída máxima exige su fuente');
select lives_ok(format($$update public.model_portfolios set worst_drawdown_bps = 3500, worst_drawdown_source = 'Simulación histórica 2008-2009, fuente a documentar' where id = %L$$, :'port'),
  'con fuente se acepta');
select lives_ok(format($q$do $b$ begin
  insert into public.asset_compositions values (%L, %L, '2026-09-30', 'holding', 'Posición 1', 400, 'Ficha del fondo'), (%L, %L, '2026-09-30', 'holding', 'Posición 2', 300, 'Ficha del fondo');
  set constraints all immediate; end $b$$q$, :'etf', :'sp', :'etf', :'sp'), 'composición parcial (top posiciones) ≤ 10000 pb');
select throws_ok(format($q$do $b$ begin
  insert into public.asset_compositions values (%L, %L, '2026-09-30', 'region', 'a', 6000, 'f'), (%L, %L, '2026-09-30', 'region', 'b', 5000, 'f');
  set constraints all immediate; end $b$$q$, :'etf', :'sp', :'etf', :'sp'), '23514', null, 'composición que supera 10000 pb se rechaza');

-- Supuestos, objetivos, pendientes y perfil
select throws_ok(format($$insert into public.assumptions (space_id, key, value, unit, effective_from) values (%L, 'monthly_net_income', 1, 'currency_minor', '2026-01-01')$$, :'sp'),
  '23514', null, 'un supuesto en unidades monetarias exige moneda');
select lives_ok(format($$insert into public.assumptions (space_id, key, person_id, value, unit, currency, effective_from) values (%L, 'monthly_net_income', %L, 100000, 'currency_minor', 'EUR', '2026-01-01')$$, :'sp', :'p1'),
  'supuesto por persona con moneda');
select throws_ok(format($$insert into public.assumptions (space_id, key, person_id, value, unit, currency, effective_from) values (%L, 'monthly_net_income', %L, 1, 'currency_minor', 'EUR', '2026-01-01')$$, :'sp', :'p1'),
  '23505', null, 'un supuesto no se duplica para la misma clave, persona y fecha');
select lives_ok(format($$insert into public.tasks (space_id, title, account_id, person_id, blocked_by) values (%L, 'Mover el dinero a otra entidad', %L, %L, 'Falta un documento de identidad')$$, :'sp', :'acc_ext', :'p2'),
  'un pendiente puede enlazar cuenta y persona');
select throws_ok(format($$insert into public.tasks (space_id, title, status, completed_at) values (%L, 'x', 'open', now())$$, :'sp'),
  '23514', null, 'completed_at solo con estado done');
select throws_ok(format($$insert into public.risk_profiles (space_id, person_id, questionnaire_version, max_tolerable_loss_minor) values (%L, %L, 1, 500000)$$, :'sp', :'p1'),
  '23514', null, 'la pérdida máxima exige moneda');
select lives_ok(format($$insert into public.risk_profiles (space_id, person_id, questionnaire_version, max_tolerable_loss_minor, max_tolerable_loss_currency) values (%L, %L, 1, 500000, 'EUR')$$, :'sp', :'p1'),
  'perfil con pérdida máxima declarada');

-- Avisos: nivel 3 prohibido en tabla y en RPC; flags por país
select tests.as_postgres();
select throws_ok(format($$insert into public.recommendations (space_id, rule_id, rule_version, level, severity, inputs_hash, message_key, confidence) values (%L, 'r', 1, 3, 'info', decode(repeat('00', 32), 'hex'), 'k', 'high')$$, :'sp'),
  '23514', null, 'el nivel 3 está prohibido en la tabla (no basta con una flag)');
select tests.authenticate_as(:'vic');
select public.upsert_recommendation(:'sp', 'idle_cash', 1, 2::smallint, 'attention', decode(repeat('ab', 32), 'hex'), '{"liquidity_months": 40}', '{"idle_cash_months": 12}', 'reco.idle_cash', '{}', 'high') as rec \gset
select ok(:'rec' is not null, 'un miembro de solo lectura puede disparar la evaluación de avisos (nivel 2 activo en ES)');
select is(public.upsert_recommendation(:'sp', 'idle_cash', 1, 2::smallint, 'attention', decode(repeat('ab', 32), 'hex'), '{}', '{}', 'reco.idle_cash', '{}', 'high'), :'rec'::uuid, 'idempotente por regla + hash de entradas');
select tests.authenticate_as(:'alicia');
select throws_ok(format($$select public.upsert_recommendation(%L, 'idle_cash', 1, 2::smallint, 'info', decode(repeat('cd', 32), 'hex'), '{}', '{}', 'k', '{}', 'high')$$, :'sp_pt'),
  '42501', null, 'el nivel 2 está desactivado en países sin plantillas revisadas');
select throws_ok(format($$select public.upsert_recommendation(%L, 'r', 1, 3::smallint, 'info', decode(repeat('ef', 32), 'hex'), '{}', '{}', 'k', '{}', 'high')$$, :'sp'),
  '42501', null, 'la RPC rechaza el nivel 3');
select tests.authenticate_as(:'beto');
select throws_ok(format($$select public.upsert_recommendation(%L, 'r', 1, 1::smallint, 'info', decode(repeat('12', 32), 'hex'), '{}', '{}', 'k', '{}', 'high')$$, :'sp'),
  '42501', null, 'un no miembro no puede registrar avisos en un espacio ajeno');

-- Estado de los avisos y eventos
select tests.authenticate_as(:'vic');
select is_empty(format($$update public.recommendations set status = 'dismissed' where id = %L returning 1$$, :'rec'), 'solo lectura no descarta avisos');
select lives_ok(format($$insert into public.recommendation_events (recommendation_id, space_id, event, user_id) values (%L, %L, 'shown', %L)$$, :'rec', :'sp', :'vic'), 'un miembro registra su propio evento');
select throws_ok(format($$insert into public.recommendation_events (recommendation_id, space_id, event, user_id) values (%L, %L, 'shown', %L)$$, :'rec', :'sp', :'alicia'),
  '42501', null, 'no se registran eventos a nombre de otro usuario');
select tests.authenticate_as(:'aser');
select throws_ok(format($$insert into public.recommendation_events (recommendation_id, space_id, event, user_id) values (%L, %L, 'shown', %L)$$, :'rec', :'sp', :'aser'),
  '42501', null, 'el asesor no registra eventos');
select tests.authenticate_as(:'alicia');
select lives_ok(format($$update public.recommendations set status = 'dismissed', dismissed_reason = 'No me aplica' where id = %L$$, :'rec'), 'un editor descarta un aviso con motivo');
select throws_ok(format($$update public.recommendations set rule_id = 'otra' where id = %L$$, :'rec'), '42501', null, 'la regla de un aviso no se edita');

select * from finish();
rollback;

-- ADR-0017: bolsillos, reparto, reglas con historial, tramos de remuneración y procedencia.
begin;
select plan(48);

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('aser@example.test') as aser \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('Hogar') as sp \gset
select public.create_invitation(:'sp', 'vic@example.test', 'viewer') as t1 \gset
select public.create_invitation(:'sp', 'aser@example.test', 'advisor', 10::smallint) as t2 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'aser'); select public.accept_invitation(:'t2');
select tests.authenticate_as(:'beto'); select public.create_space('Otro') as sp_b \gset

select tests.authenticate_as(:'alicia');
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Efectivo', 'savings', 'EUR') returning id as acc \gset
insert into public.accounts (space_id, name, kind, currency) values (:'sp', 'Bróker', 'brokerage', 'EUR') returning id as brk \gset
insert into public.assets (space_id, kind, name, currency, asset_class) values (:'sp', 'etf', 'ETF', 'EUR', 'equity') returning id as etf \gset
insert into public.pockets (space_id, kind, name, target_minor, currency, target_on, risk_level, horizon_years)
  values (:'sp', 'home', 'Casa', 5000000, 'EUR', '2029-06-01', 'low', 3) returning id as home \gset
insert into public.pockets (space_id, kind, name, risk_level) values (:'sp', 'emergency', 'Colchón', 'none') returning id as cush \gset
insert into public.pockets (space_id, kind, name, risk_level) values (:'sp', 'long_term', 'Largo plazo', 'high') returning id as lt \gset

set constraints all immediate; -- las sumas de reparto se validan al final de la transacción; aquí, en cada sentencia

-- Bolsillos
select throws_ok(
  format($$insert into public.pockets (space_id, name, target_minor) values (%L, 'Sin moneda', 100)$$, :'sp'),
  '23514', null, 'un objetivo de importe exige moneda');
select throws_ok(
  format($$insert into public.pockets (space_id, name, target_on) values (%L, 'Fecha sin importe', '2030-01-01')$$, :'sp'),
  '23514', null, 'una fecha objetivo exige importe objetivo');
select throws_ok(
  format($$insert into public.pockets (space_id, name, risk_level) values (%L, 'Mal riesgo', 'extremo')$$, :'sp'),
  '23514', null, 'el nivel de riesgo es de una lista cerrada');
select throws_ok(
  format($$insert into public.pockets (space_id, name) values (%L, 'Casa')$$, :'sp'),
  '23505', null, 'no hay dos bolsillos activos con el mismo nombre');

-- Reparto entre bolsillos
select lives_ok(format($q$do $b$ begin
  insert into public.pocket_allocations (space_id, pocket_id, account_id, effective_from, weight_bps) values (%L, %L, %L, '2026-01-01', 6000);
  insert into public.pocket_allocations (space_id, pocket_id, account_id, effective_from, weight_bps) values (%L, %L, %L, '2026-01-01', 4000);
end $b$$q$, :'sp', :'cush', :'acc', :'sp', :'home', :'acc'),
  'una cuenta puede repartirse entre dos bolsillos hasta el 100 %');
select throws_ok(
  format($$insert into public.pocket_allocations (space_id, pocket_id, account_id, effective_from, weight_bps) values (%L, %L, %L, '2026-01-01', 1)$$, :'sp', :'lt', :'acc'),
  '23514', null, 'no se puede asignar más del 100 % de una cuenta');
select lives_ok(format($q$do $b$ begin
  insert into public.pocket_allocations (space_id, pocket_id, account_id, effective_from, weight_bps) values (%L, %L, %L, '2026-01-01', 3000);
end $b$$q$, :'sp', :'lt', :'brk'),
  'asignar menos del 100 % es válido: el resto es efectivo sin función');
select throws_ok(
  format($$insert into public.pocket_allocations (space_id, pocket_id, account_id, asset_id, effective_from, weight_bps) values (%L, %L, %L, %L, '2026-01-01', 1000)$$, :'sp', :'lt', :'brk', :'etf'),
  '23514', null, 'una cuenta no se reparte a la vez entera y por posiciones');
select throws_ok(
  format($$insert into public.pocket_allocations (space_id, pocket_id, account_id, effective_from, weight_bps) values (%L, %L, %L, '2026-01-01', 100)$$, :'sp', :'lt', :'brk'),
  '23505', null, 'no se repite la asignación del mismo destino al mismo bolsillo');

-- Historial del reparto (para el rendimiento de cada bolsillo en el pasado)
select lives_ok(format($$insert into public.pocket_allocations (space_id, pocket_id, account_id, effective_from, weight_bps) values (%L, %L, %L, '2026-06-01', 10000)$$, :'sp', :'lt', :'acc'),
  'cambiar el reparto añade un conjunto nuevo con su fecha');
select is((select array_agg(weight_bps order by weight_bps) from public.pocket_allocations_on(:'sp', '2026-03-01') where account_id = :'acc'),
  array[4000, 6000], 'en marzo rige el reparto antiguo (colchón 60 %, casa 40 %)');
select is((select array_agg(pocket_id) from public.pocket_allocations_on(:'sp', '2026-07-01') where account_id = :'acc'),
  array[:'lt'::uuid], 'desde junio rige el nuevo (todo a largo plazo)');
select lives_ok(format($$insert into public.pocket_allocations (space_id, pocket_id, account_id, asset_id, effective_from, weight_bps) values (%L, %L, %L, %L, '2026-06-01', 10000)$$, :'sp', :'lt', :'brk', :'etf'),
  'en otra fecha la cuenta puede pasar a repartirse por posiciones');

-- Reglas
insert into public.advice_rules (space_id, template, scope, pocket_id, metric, comparator, threshold, unit, severity)
  values (:'sp', 'emergency_fund_months', 'pocket', :'cush', 'months_of_expenses', 'lt', 6, 'months', 'attention')
  returning id as rule \gset
select is((select count(*)::int from public.advice_rule_revisions where rule_id = :'rule' and change = 'created' and version = 1),
  1, 'crear una regla registra la revisión inicial');
select ok(not exists (select 1 from public.advice_rule_revisions where snapshot ? 'note'), 'el historial no copia la anotación libre');
update public.advice_rules set threshold = 3 where id = :'rule';
select is((select version from public.advice_rules where id = :'rule'), 2, 'cambiar el umbral incrementa la versión');
update public.advice_rules set note = 'solo una nota' where id = :'rule';
select is((select version from public.advice_rules where id = :'rule'), 2, 'cambiar solo la anotación no cambia la versión');
select throws_ok(
  format($$update public.advice_rules set status = 'paused' where id = %L$$, :'rule'),
  '23514', null, 'pausar una regla exige motivo y fecha');
update public.advice_rules set status = 'paused', paused_on = '2026-10-26', paused_reason = 'vacaciones' where id = :'rule';
update public.advice_rules set status = 'active', paused_on = null, paused_reason = null where id = :'rule';
select is((select array_agg(change order by id) from public.advice_rule_revisions where rule_id = :'rule'),
  array['created', 'updated', 'updated', 'paused', 'resumed'], 'el historial recoge creación, cambios, pausa y reanudación');
select throws_ok(
  format($$insert into public.advice_rules (space_id, template, scope, metric, comparator, threshold, unit) values (%L, 't', 'pocket', 'm', 'lt', 1, 'count')$$, :'sp'),
  '23514', null, 'una regla de bolsillo exige bolsillo');
select throws_ok(
  format($$insert into public.advice_rules (space_id, template, scope, metric, comparator, threshold, unit) values (%L, 't', 'space', 'm', 'lt', 1, 'currency_minor')$$, :'sp'),
  '23514', null, 'un umbral en dinero exige moneda');
select throws_ok(format($$delete from public.advice_rules where id = %L$$, :'rule'), '42501', null, 'las reglas no se borran, se archivan');
select throws_ok(format($$insert into public.advice_rule_revisions (rule_id, space_id, version, change, snapshot) values (%L, %L, 9, 'updated', '{}')$$, :'rule', :'sp'),
  '42501', null, 'el historial no se escribe a mano');
select throws_ok(format($$update public.advice_rule_revisions set change = 'created' where rule_id = %L$$, :'rule'),
  '42501', null, 'ni se modifica');

-- Tramos de remuneración
insert into public.cash_rate_tiers (space_id, account_id, effective_from, up_to_minor, rate_bps, currency, source)
  values (:'sp', :'acc', '2026-01-01', 500000, 300, 'EUR', 'ficha de la entidad') returning id as tier \gset
select is((select needs_verification from public.cash_rate_tiers where id = :'tier'), true, 'un tramo nuevo nace marcado como "verificar"');
select lives_ok(
  format($$insert into public.cash_rate_tiers (space_id, account_id, effective_from, rate_bps, currency, source) values (%L, %L, '2026-01-01', 100, 'EUR', 'ficha')$$, :'sp', :'acc'),
  'el tramo abierto (resto del saldo) convive con los tramos con tope');
select throws_ok(
  format($$insert into public.cash_rate_tiers (space_id, account_id, effective_from, rate_bps, currency, source) values (%L, %L, '2026-01-01', 50, 'EUR', 'ficha')$$, :'sp', :'acc'),
  '23505', null, 'solo un tramo abierto por cuenta y fecha');
select throws_ok(
  format($$insert into public.cash_rate_tiers (space_id, account_id, effective_from, rate_bps, currency, source) values (%L, %L, '2026-02-01', 50, 'USD', 'ficha')$$, :'sp', :'acc'),
  '23514', null, 'la moneda del tramo es la de la cuenta');

-- Procedencia: el autor lo fija el servidor, no el cliente
select is((select entered_by from public.cash_rate_tiers where id = :'tier'), :'alicia'::uuid, 'entered_by es el usuario autenticado');
insert into public.valuations (space_id, account_id, as_of, value_minor, currency, source, entered_by)
  values (:'sp', :'acc', '2026-10-25', 100, 'EUR', 'statement', :'beto'::uuid) returning id as val \gset
select is((select entered_by from public.valuations where id = :'val'), :'alicia'::uuid, 'un cliente no puede atribuir un dato a otro usuario');
select throws_ok(format($$update public.valuations set entered_by = %L where id = %L$$, :'beto', :'val'), '42501', null, 'ni reescribir la procedencia después');

-- Entidades
insert into public.institutions (space_id, name, kind, country_code) values (:'sp', 'Banco de prueba', 'bank', 'ES') returning id as inst \gset
select throws_ok(format($$insert into public.institutions (space_id, name) values (%L, 'Banco de prueba')$$, :'sp'),
  '23505', null, 'una entidad no se repite en el espacio (la concentración por entidad cuadra)');
select lives_ok(format($$update public.accounts set institution_id = %L where id = %L$$, :'inst', :'acc'), 'una cuenta apunta a su entidad');

-- Avisos enlazados con la regla del usuario que los generó
select public.upsert_recommendation(:'sp', 'emergency_fund_months', 2, 2::smallint, 'attention', decode(repeat('ab', 32), 'hex'),
  '{}', '{}', 'reco.emergency_fund', '{}', 'high', :'rule') as rec \gset
select is((select advice_rule_id from public.recommendations where id = :'rec'), :'rule'::uuid, 'el aviso guarda la regla que lo generó');

-- Consentimiento para IA (por usuario, revocable) y puerta única
select lives_ok(format($$insert into public.user_consents (user_id, purpose, policy_version) values (%L, 'ai_explanations', 1)$$, :'alicia'),
  'el usuario da su consentimiento');
select throws_ok(format($$insert into public.user_consents (user_id, purpose, policy_version) values (%L, 'ai_explanations', 1)$$, :'alicia'),
  '23505', null, 'un solo consentimiento vigente por propósito');
select throws_ok(format($$insert into public.user_consents (user_id, purpose, policy_version) values (%L, 'ai_explanations', 1)$$, :'beto'),
  '42501', null, 'nadie consiente en nombre de otro');
select is(public.ai_explanations_allowed(:'sp'), false, 'con consentimiento pero la IA desactivada por flag, no se usa');
update public.user_consents set withdrawn_at = now() where user_id = :'alicia';
select is((select count(*)::int from public.user_consents where withdrawn_at is null), 0, 'el consentimiento se retira y queda constancia');

-- Procedencia de los movimientos (el cuadre se valida al final de la transacción, como en producción)
set constraints all deferred;
select public.create_transaction(:'sp', 'contribution', '2026-10-25', jsonb_build_array(
  jsonb_build_object('role', 'external', 'amount_minor', '-100', 'currency', 'EUR'),
  jsonb_build_object('role', 'cash', 'account_id', :'acc', 'amount_minor', '100', 'currency', 'EUR')), null, 'settled', 'statement') as tx \gset
set constraints all immediate;
select is((select source || ':' || entered_by from public.transactions where id = :'tx'), 'statement:' || :'alicia', 'un movimiento guarda su origen y quién lo registró');
select throws_ok(format($$update public.transactions set source = 'manual' where id = %L$$, :'tx'), '42501', null, 'y no se reescriben después');

-- Regla por producto (la "justificación guardada" de una excepción)
select lives_ok(format($$insert into public.advice_rules (space_id, template, scope, asset_id, metric, comparator, threshold, unit, status, paused_on, paused_reason) values (%L, 'high_fees', 'asset', %L, 'ter_bps', 'gt', 50, 'bps', 'paused', '2026-10-26', 'Lo mantengo por su fiscalidad')$$, :'sp', :'etf'),
  'una regla puede aplicarse a un producto y pausarse con su justificación');

-- Revisiones y listas de comprobación
select throws_ok(format($$insert into public.tasks (space_id, kind, title, checklist) values (%L, 'todo', 'x', '{"tax_effect": true}')$$, :'sp'),
  '23514', null, 'solo una lista de comprobación lleva respuestas');
select lives_ok(format($$insert into public.tasks (space_id, kind, title, checklist) values (%L, 'checklist', 'Antes de traspasar', '{"tax_effect": true, "exit_fee": false}')$$, :'sp'),
  'una lista de comprobación guarda sus respuestas');
select lives_ok(format($$insert into public.tasks (space_id, kind, title, status, completed_at) values (%L, 'review', 'Revisión trimestral', 'done', now())$$, :'sp'),
  'una revisión hecha queda registrada para la regla de revisión pendiente');

-- Permisos por rol y aislamiento
select tests.authenticate_as(:'vic');
select throws_ok(format($$insert into public.pockets (space_id, name) values (%L, 'X')$$, :'sp'), '42501', null, 'solo lectura no crea bolsillos');
select tests.authenticate_as(:'aser');
select is((select count(*)::int from public.advice_rules), 2, 'el asesor vigente lee las reglas');
select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.pockets where space_id = :'sp'), 0, 'otro espacio no ve los bolsillos');

select * from finish();
rollback;

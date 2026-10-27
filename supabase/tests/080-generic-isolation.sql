-- Aislamiento en TODAS las tablas con space_id, generado desde el catálogo. El fixture debe cubrir
-- cada tabla: una tabla nueva sin fixture hace fallar el test 1 y obliga a ampliarlo.
begin;
select plan(12);

create function tests.space_tables() returns setof text language sql stable as $f$
  select c.relname::text from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'space_id' and not a.attisdropped
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  order by 1;
$f$;

create function tests.visible_counts(p_space uuid) returns table (tbl text, n bigint) language plpgsql as $f$
declare r text;
begin
  for r in select * from tests.space_tables() loop
    begin
      execute format('select count(*) from public.%I where space_id = $1', r) into n using p_space;
    exception when insufficient_privilege then n := -1; -- sin permiso de lectura
    end;
    tbl := r; return next;
  end loop;
end $f$;

-- Intenta modificar y borrar filas del espacio; devuelve cuántas filas pudo tocar por tabla.
create function tests.write_attempts(p_space uuid) returns table (tbl text, touched bigint) language plpgsql as $f$
declare r text; n bigint;
begin
  for r in select * from tests.space_tables() loop
    touched := 0;
    begin
      execute format('update public.%I set space_id = space_id where space_id = $1', r) using p_space;
      get diagnostics n = row_count; touched := touched + n;
    exception when insufficient_privilege then null; end;
    -- Abandonar un espacio (borrar la propia membresía) está permitido por diseño; se prueba en 020.
    if r <> 'space_members' then
      begin
        execute format('delete from public.%I where space_id = $1', r) using p_space;
        get diagnostics n = row_count; touched := touched + n;
      exception when insufficient_privilege or foreign_key_violation then null; end;
    end if;
    tbl := r; return next;
  end loop;
end $f$;

create function tests.seed_space(p_space uuid) returns void language plpgsql as $f$
declare p1 uuid; p2 uuid; a1 uuid; a2 uuid; a3 uuid; ast uuid; tx uuid; pl uuid; op uuid;
        rec uuid; bt uuid; cat uuid; pk uuid;
begin
  insert into public.persons (space_id, display_name, kind) values (p_space, 'P1', 'adult') returning id into p1;
  insert into public.persons (space_id, display_name, kind) values (p_space, 'P2', 'minor') returning id into p2;
  insert into public.accounts (space_id, name, kind, currency) values (p_space, 'A1', 'current', 'EUR') returning id into a1;
  insert into public.accounts (space_id, name, kind, currency) values (p_space, 'A2', 'brokerage', 'EUR') returning id into a2;
  insert into public.accounts (space_id, name, kind, currency) values (p_space, 'A3', 'mortgage', 'EUR') returning id into a3;
  insert into public.account_holders values (a1, p1, p_space, 'holder', 10000);
  insert into public.loan_terms (account_id, space_id, principal_minor, rate_type, annual_rate, term_months, start_on)
    values (a3, p_space, 1000, 'fixed', 0.03, 300, '2026-01-01');
  insert into public.assets (space_id, kind, name, currency, asset_class) values (p_space, 'etf', 'ETF', 'EUR', 'equity') returning id into ast;
  insert into public.categories (space_id, name, kind, essential) values (p_space, 'Alimentación', 'expense', true) returning id into cat;
  insert into public.category_budgets values (cat, p_space, '2026-01-01', 100, 'EUR');
  insert into public.recurring_rules (space_id, name, kind, amount_minor, currency, frequency, start_on)
    values (p_space, 'Nómina', 'income', 100, 'EUR', 'monthly', '2026-01-01');
  insert into public.categorization_rules (space_id, pattern, category_id) values (p_space, 'SUPERMERCADO', cat);
  insert into public.transactions (space_id, kind, occurred_on) values (p_space, 'contribution', '2026-01-01') returning id into tx;
  insert into public.transaction_legs (transaction_id, space_id, role, amount_minor, currency) values (tx, p_space, 'external', -100, 'EUR');
  insert into public.transaction_legs (transaction_id, space_id, role, account_id, amount_minor, currency) values (tx, p_space, 'cash', a1, 100, 'EUR');
  insert into public.valuations (space_id, account_id, as_of, value_minor, currency) values (p_space, a1, '2026-01-01', 100, 'EUR');
  insert into public.pockets (space_id, name, kind, person_id) values (p_space, 'Colchón', 'emergency', p1) returning id into pk;
  insert into public.pocket_allocations (space_id, pocket_id, account_id, weight_bps) values (p_space, pk, a1, 5000);
  insert into public.advice_rules (space_id, template, scope, pocket_id, metric, comparator, threshold, unit)
    values (p_space, 'emergency_fund_months', 'pocket', pk, 'x', 'lt', 6, 'months');
  insert into public.cash_rate_tiers (space_id, account_id, effective_from, rate_bps, currency, source)
    values (p_space, a1, '2026-01-01', 200, 'EUR', 'fuente');
  insert into public.asset_fact_sheets (asset_id, space_id, as_of, ter_bps, source) values (ast, p_space, '2026-01-01', 10, 'ficha');
  insert into public.assumptions (space_id, key, value, unit, effective_from) values (p_space, 'expected_inflation', 300, 'bps', '2026-01-01');
  insert into public.tasks (space_id, title) values (p_space, 't');
  insert into public.investment_plans (space_id, name, total_minor, currency, start_on) values (p_space, 'P', 100, 'EUR', '2026-01-01') returning id into pl;
  insert into public.planned_operations (space_id, plan_id, kind, planned_on, amount_minor, currency) values (p_space, pl, 'buy', '2026-01-01', 100, 'EUR') returning id into op;
  insert into public.planned_operation_allocations (operation_id, space_id, label, weight_bps) values (op, p_space, 'x', 10000);
  insert into public.asset_compositions values (ast, p_space, '2026-01-01', 'region', 'world', 10000, 'fuente');
  insert into public.risk_profiles (space_id, person_id, questionnaire_version) values (p_space, p1, 1);
  insert into public.recommendations (space_id, rule_id, rule_version, level, severity, inputs_hash, message_key, confidence)
    values (p_space, 'r', 1, 2, 'info', decode(repeat('0a', 32), 'hex'), 'k', 'high') returning id into rec;
  insert into public.recommendation_events (recommendation_id, space_id, event) values (rec, p_space, 'shown');
  insert into public.import_mappings (space_id, name, mapping) values (p_space, 'm', '{}');
  insert into public.import_batches (space_id, account_id, file_kind, file_sha256, storage_path)
    values (p_space, a1, 'csv', decode(repeat('01', 32), 'hex'), p_space::text || '/f.csv') returning id into bt;
  insert into public.import_rows (batch_id, space_id, account_id, row_index, fingerprint, status)
    values (bt, p_space, a1, 0, decode(repeat('02', 32), 'hex'), 'new');
  insert into public.space_invitations (space_id, email_normalized, role, token_hash, expires_at)
    values (p_space, 'x@example.test', 'viewer', decode(repeat('03', 32), 'hex'), now() + interval '1 day');
  set constraints all immediate; -- valida las sumas y el cuadre del fixture
end $f$;

grant usage on schema tests to authenticated, anon;
grant execute on function tests.space_tables(), tests.visible_counts(uuid), tests.write_attempts(uuid) to authenticated, anon;

select tests.create_user('alicia@example.test') as alicia \gset
select tests.create_user('vic@example.test') as vic \gset
select tests.create_user('aser@example.test') as aser \gset
select tests.create_user('beto@example.test') as beto \gset

select tests.authenticate_as(:'alicia');
select public.create_space('A') as sp_a \gset
select public.create_invitation(:'sp_a', 'vic@example.test', 'viewer') as t1 \gset
select public.create_invitation(:'sp_a', 'aser@example.test', 'advisor', 10::smallint) as t2 \gset
select tests.authenticate_as(:'vic'); select public.accept_invitation(:'t1');
select tests.authenticate_as(:'aser'); select public.accept_invitation(:'t2');
select tests.authenticate_as(:'beto');
select public.create_space('B') as sp_b \gset

select tests.as_postgres();
select tests.seed_space(:'sp_a');

-- 1. El fixture cubre todas las tablas con space_id (la propietaria las ve todas con datos)
select tests.authenticate_as(:'alicia');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.visible_counts(:'sp_a') where n <= 0),
  '{}'::text[], '1. el fixture cubre todas las tablas con space_id y la propietaria las lee todas');

-- 2-3. Otro usuario: ve 0 filas y no puede tocar nada
select tests.authenticate_as(:'beto');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.visible_counts(:'sp_a') where n > 0),
  '{}'::text[], '2. un usuario de otro espacio no ve ninguna fila en ninguna tabla');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.write_attempts(:'sp_a') where touched > 0),
  '{}'::text[], '3. ni puede modificar ni borrar filas en ninguna tabla');

-- 4-5. Solo lectura
select tests.authenticate_as(:'vic');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.visible_counts(:'sp_a') where n <= 0),
  array['space_invitations'], '4. solo lectura ve todas las tablas salvo las invitaciones (solo propietarios)');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.write_attempts(:'sp_a') where touched > 0),
  '{}'::text[], '5. solo lectura no puede modificar ni borrar nada (salvo abandonar el espacio)');

-- 6-7. Asesor
select tests.authenticate_as(:'aser');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.visible_counts(:'sp_a') where n <= 0),
  array['import_batches', 'import_mappings', 'import_rows', 'space_invitations'],
  '6. el asesor no ve importaciones ni invitaciones, y sí el resto');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.write_attempts(:'sp_a') where touched > 0),
  '{}'::text[], '7. el asesor no puede modificar ni borrar nada');
select is((select count(*)::int from public.space_members where space_id = :'sp_a'), 1, '8. el asesor solo ve su propia membresía');

-- 9. Asesor caducado
select tests.as_postgres();
update public.space_members set expires_at = now() - interval '1 second' where user_id = :'aser';
select tests.authenticate_as(:'aser');
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.visible_counts(:'sp_a') where n > 0 and tbl <> 'space_members'),
  '{}'::text[], '9. un asesor caducado no ve ninguna tabla');

-- 10. anon no puede leer nada
select tests.as_anon();
select is((select coalesce(array_agg(tbl order by tbl), '{}') from tests.visible_counts(:'sp_a') where n <> -1),
  '{}'::text[], '10. anon no puede leer ninguna tabla');

-- 11. Las funciones de saldos son security invoker: aplican la RLS del usuario
select tests.authenticate_as(:'beto');
select is((select count(*)::int from public.account_cash_balances(:'sp_a')), 0, '11. los saldos de un espacio ajeno salen vacíos (RLS en funciones security invoker)');

-- 12. space_id inmutable para el propietario
select tests.authenticate_as(:'alicia');
select throws_ok(format($$update public.accounts set space_id = %L where space_id = %L$$, :'sp_b', :'sp_a'), '42501', null, '12. ni el propietario puede mover una fila a otro espacio');

select * from finish();
rollback;

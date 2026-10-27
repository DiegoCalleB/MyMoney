-- =============================================================================
-- 3/5 · Supuestos, ingresos y gastos previstos, pendientes, planes (reales e hipótesis),
--       composición de fondos, perfil de riesgo y avisos.
-- docs/plan/04-modelo-datos.md y docs/plan/14-caso-de-referencia.md.
-- Mismas reglas: FKs compuestas por espacio, RLS forzada, permisos mínimos.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Supuestos editables (ingresos, gasto, inflación, umbrales…)
-- ---------------------------------------------------------------------------
create table public.assumptions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_.]{1,60}$'),
  person_id uuid,
  value numeric(24, 10) not null,
  unit text not null check (unit in ('currency_minor', 'bps', 'ratio', 'months', 'years', 'count')),
  currency char(3) references ref.currencies (code),
  effective_from date not null,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, space_id) references public.persons (id, space_id) on delete cascade,
  check ((unit = 'currency_minor') = (currency is not null)),
  unique nulls not distinct (space_id, key, person_id, effective_from)
);
comment on column public.assumptions.note is 'Anotación libre del usuario. [pii]';
comment on table public.assumptions is 'Supuestos del usuario con vigencia (p. ej., monthly_net_income por persona, expected_inflation, speculative_cap_bps). Valores por defecto en código. [financiero]';
create index assumptions_lookup_idx on public.assumptions (space_id, key, effective_from desc);
create index assumptions_person_idx on public.assumptions (space_id, person_id) where person_id is not null;
create index assumptions_currency_idx on public.assumptions (currency) where currency is not null;

-- ---------------------------------------------------------------------------
-- Ingresos y gastos: presupuestos, movimientos recurrentes y reglas de categorización
-- ---------------------------------------------------------------------------
create table public.category_budgets (
  category_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  effective_from date not null check (extract(day from effective_from) = 1),
  amount_minor bigint not null check (amount_minor between 0 and 1000000000000000),
  currency char(3) not null references ref.currencies (code),
  primary key (category_id, effective_from),
  foreign key (category_id, space_id) references public.categories (id, space_id) on delete cascade
);
comment on table public.category_budgets is 'Presupuesto mensual por categoría con vigencia: rige desde el mes indicado hasta que otro lo sustituye. [financiero]';
create index category_budgets_category_idx on public.category_budgets (space_id, category_id);
create index category_budgets_currency_idx on public.category_budgets (currency);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('income', 'expense')),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000000),
  currency char(3) not null references ref.currencies (code),
  account_id uuid,
  category_id uuid,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  interval_count smallint not null default 1 check (interval_count between 1 and 52),
  day_of_month smallint check (day_of_month between 1 and 31),
  start_on date not null,
  end_on date,
  active boolean not null default true,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete set null (account_id),
  foreign key (category_id, space_id) references public.categories (id, space_id) on delete set null (category_id),
  check (end_on is null or end_on >= start_on)
);
comment on column public.recurring_rules.name is 'Nombre libre (p. ej., el pagador o el comercio). [pii]';
comment on column public.recurring_rules.note is 'Anotación libre del usuario. [pii]';
comment on table public.recurring_rules is 'Ingresos y gastos previstos (nómina, alquiler, suscripciones) para previsión de caja y recordatorios. No crean movimientos por sí solas: el usuario los confirma. [financiero]';
create index recurring_rules_space_idx on public.recurring_rules (space_id, active);
create index recurring_rules_account_idx on public.recurring_rules (space_id, account_id) where account_id is not null;
create index recurring_rules_category_idx on public.recurring_rules (space_id, category_id) where category_id is not null;
create index recurring_rules_currency_idx on public.recurring_rules (currency);

create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  pattern text not null check (char_length(pattern) between 1 and 80),
  match_type text not null default 'contains' check (match_type in ('contains', 'starts_with', 'equals')),
  category_id uuid not null,
  priority integer not null default 100 check (priority between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  unique (space_id, match_type, pattern),
  foreign key (category_id, space_id) references public.categories (id, space_id) on delete cascade
);
comment on table public.categorization_rules is 'Reglas deterministas elegidas por el usuario para sugerir categoría al importar ("contiene X ⇒ categoría Y"). Sin inferencia automática de categorías sensibles. [pii]';
comment on column public.categorization_rules.pattern is 'Texto que escribe el usuario (p. ej., un comercio). [pii]';
create index categorization_rules_category_idx on public.categorization_rules (space_id, category_id);

-- ---------------------------------------------------------------------------
-- Pendientes (recordatorios con contexto)
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null default 'todo' check (kind in ('todo', 'review', 'checklist')),
  title text not null check (char_length(title) between 1 and 120),
  notes text check (char_length(notes) <= 500),
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object' and pg_column_size(checklist) <= 4096),
  due_on date,
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  account_id uuid,
  person_id uuid,
  blocked_by text check (char_length(blocked_by) <= 200),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete set null (account_id),
  foreign key (person_id, space_id) references public.persons (id, space_id) on delete set null (person_id),
  check (completed_at is null or status = 'done'),
  check (kind = 'checklist' or checklist = '{}'::jsonb)
);
comment on column public.tasks.kind is 'todo = pendiente libre; review = revisión periódica (la regla de "revisión pendiente" mira la última hecha); checklist = comprobaciones antes de contratar o traspasar.';
comment on column public.tasks.checklist is 'Respuestas a la lista cerrada de comprobaciones (efecto fiscal, comisión de reembolso, solapamientos…), por clave del catálogo; validadas con Zod.';
comment on column public.tasks.title is 'Texto libre del usuario. [pii]';
comment on column public.tasks.notes is 'Texto libre del usuario. [pii]';
comment on column public.tasks.blocked_by is 'Texto libre del usuario. [pii]';
comment on table public.tasks is 'Pendientes: "mover el dinero de X a otro sitio", "conseguir el DNI de Y"… No son asesoramiento: los escribe el usuario.';
create index tasks_space_idx on public.tasks (space_id, status, due_on);
create index tasks_review_idx on public.tasks (space_id, completed_at desc) where kind = 'review' and status = 'done';
create index tasks_account_idx on public.tasks (space_id, account_id) where account_id is not null;
create index tasks_person_idx on public.tasks (space_id, person_id) where person_id is not null;

-- ---------------------------------------------------------------------------
-- Planes: calendario real de compras o hipótesis
-- ---------------------------------------------------------------------------
create table public.investment_plans (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'schedule' check (kind in ('schedule', 'what_if')),
  source_account_id uuid,
  total_minor bigint not null check (total_minor between 1 and 1000000000000000),
  currency char(3) not null references ref.currencies (code),
  start_on date not null,
  end_on date,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (source_account_id, space_id) references public.accounts (id, space_id) on delete set null (source_account_id),
  check (end_on is null or end_on >= start_on),
  check (kind = 'schedule' or status in ('draft', 'cancelled'))
);
comment on column public.investment_plans.name is 'Nombre libre del plan. [pii]';
comment on table public.investment_plans is 'Plan del usuario (no una recomendación). schedule = calendario real de entradas escalonadas; what_if = hipótesis ("¿y si traspaso?", "¿y si añado oro?") que se calcula aparte y nunca altera el patrimonio real.';
create index investment_plans_space_idx on public.investment_plans (space_id, status);
create index investment_plans_source_idx on public.investment_plans (space_id, source_account_id) where source_account_id is not null;
create index investment_plans_currency_idx on public.investment_plans (currency);

create table public.planned_operations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  plan_id uuid,
  kind text not null check (kind in ('contribution', 'buy', 'fund_switch', 'withdrawal', 'sell')),
  planned_on date not null,
  amount_minor bigint not null check (amount_minor between 1 and 1000000000000000),
  currency char(3) not null references ref.currencies (code),
  source_account_id uuid,
  target_account_id uuid,
  status text not null default 'planned' check (status in ('planned', 'done', 'skipped')),
  transaction_id uuid,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (plan_id, space_id) references public.investment_plans (id, space_id) on delete cascade,
  foreign key (source_account_id, space_id) references public.accounts (id, space_id) on delete set null (source_account_id),
  foreign key (target_account_id, space_id) references public.accounts (id, space_id) on delete set null (target_account_id),
  foreign key (transaction_id, space_id) references public.transactions (id, space_id) on delete set null (transaction_id),
  check (transaction_id is null or status = 'done')
);
comment on column public.planned_operations.note is 'Anotación libre del usuario. [pii]';
comment on table public.planned_operations is 'Operación futura. Al marcarla hecha se enlaza la transacción real; el resto del plan se recalcula.';

-- Una operación de una hipótesis nunca se marca hecha ni se enlaza con un movimiento real.
create function private.guard_planned_operation() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'done' and exists (
       select 1 from public.investment_plans p
       where p.id = new.plan_id and p.space_id = new.space_id and p.kind = 'what_if') then
    raise exception 'Una operación hipotética no se marca como hecha' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger planned_operations_guard before insert or update on public.planned_operations
  for each row execute function private.guard_planned_operation();

create index planned_operations_calendar_idx on public.planned_operations (space_id, planned_on);
create index planned_operations_plan_idx on public.planned_operations (space_id, plan_id) where plan_id is not null;
create index planned_operations_source_idx on public.planned_operations (space_id, source_account_id) where source_account_id is not null;
create index planned_operations_target_idx on public.planned_operations (space_id, target_account_id) where target_account_id is not null;
create index planned_operations_tx_idx on public.planned_operations (space_id, transaction_id) where transaction_id is not null;
create index planned_operations_currency_idx on public.planned_operations (currency);

create table public.planned_operation_allocations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  asset_id uuid,
  label text check (char_length(label) between 1 and 80),
  weight_bps integer not null check (weight_bps between 1 and 10000),
  foreign key (operation_id, space_id) references public.planned_operations (id, space_id) on delete cascade,
  foreign key (asset_id, space_id) references public.assets (id, space_id),
  check (asset_id is not null or label is not null)
);
comment on column public.planned_operation_allocations.label is 'Etiqueta libre del reparto. [pii]';
comment on table public.planned_operation_allocations is 'Reparto de una operación planificada (p. ej., 8000 pb + 2000 pb). Suman 10000 pb por operación. label permite repartir sin haber elegido producto.';
create index planned_operation_allocations_op_idx on public.planned_operation_allocations (space_id, operation_id);
create index planned_operation_allocations_asset_idx on public.planned_operation_allocations (space_id, asset_id) where asset_id is not null;

-- ---------------------------------------------------------------------------
-- Composición real de los fondos (look-through)
-- ---------------------------------------------------------------------------
create table public.asset_compositions (
  asset_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  as_of date not null,
  dimension text not null check (dimension in ('asset_class', 'region', 'currency', 'sector', 'holding')),
  key text not null check (char_length(key) between 1 and 80),
  weight_bps integer not null check (weight_bps between 0 and 10000),
  source text not null check (char_length(source) between 1 and 200),
  primary key (asset_id, as_of, dimension, key),
  foreign key (asset_id, space_id) references public.assets (id, space_id) on delete cascade
);
comment on table public.asset_compositions is 'Composición publicada de un activo en una fecha, con su fuente. Si no hay datos, la aplicación lo dice en lugar de suponer. Suma ≤ 10000 pb por dimensión (puede ser parcial: top 10).';
create index asset_compositions_asset_idx on public.asset_compositions (space_id, asset_id, as_of desc);

-- ---------------------------------------------------------------------------
-- Perfil de riesgo
-- ---------------------------------------------------------------------------
create table public.risk_profiles (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  person_id uuid not null,
  questionnaire_version smallint not null check (questionnaire_version > 0),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 16384),
  horizon_years smallint check (horizon_years between 0 and 100),
  capacity_score smallint check (capacity_score between 0 and 100),
  tolerance_score smallint check (tolerance_score between 0 and 100),
  knowledge_score smallint check (knowledge_score between 0 and 100),
  max_tolerable_loss_minor bigint check (max_tolerable_loss_minor between 0 and 1000000000000000),
  max_tolerable_loss_currency char(3) references ref.currencies (code),
  loss_confirmed boolean not null default false,
  completed_at timestamptz not null default now(),
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id, space_id) references public.persons (id, space_id) on delete cascade,
  check ((max_tolerable_loss_minor is null) = (max_tolerable_loss_currency is null))
);
comment on table public.risk_profiles is 'Perfil financiero (NO es un test de idoneidad MiFID). Separa capacidad de tolerancia; la pérdida máxima declarada alimenta el simulador de caídas. [financiero] [pii]';
create index risk_profiles_person_idx on public.risk_profiles (space_id, person_id, completed_at desc);
create index risk_profiles_currency_idx on public.risk_profiles (max_tolerable_loss_currency) where max_tolerable_loss_currency is not null;

-- ---------------------------------------------------------------------------
-- Avisos (niveles 1-2) y su historial
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  rule_id text not null check (rule_id ~ '^[a-z0-9_.]{1,60}$'),
  rule_version integer not null check (rule_version > 0),
  -- El nivel 3 (productos concretos) está prohibido también aquí: relajarlo exige una migración
  -- explícita y el dictamen legal (docs/plan/07).
  level smallint not null check (level between 1 and 2),
  severity text not null check (severity in ('info', 'attention', 'important')),
  status text not null default 'active' check (status in ('active', 'dismissed', 'resolved', 'expired')),
  inputs_hash bytea not null check (octet_length(inputs_hash) = 32),
  inputs_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs_snapshot) = 'object' and pg_column_size(inputs_snapshot) <= 16384),
  assumptions_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(assumptions_snapshot) = 'object' and pg_column_size(assumptions_snapshot) <= 16384),
  message_key text not null check (message_key ~ '^[a-z0-9_.]{1,100}$'),
  message_params jsonb not null default '{}'::jsonb check (jsonb_typeof(message_params) = 'object' and pg_column_size(message_params) <= 4096),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  first_shown_at timestamptz,
  dismissed_reason text check (char_length(dismissed_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  unique (space_id, rule_id, inputs_hash)
);
comment on column public.recommendations.dismissed_reason is 'Motivo libre del usuario. [pii]';
comment on table public.recommendations is 'Avisos emitidos con su regla, versión, entradas y supuestos (evidencia de qué se mostró). Se crean mediante upsert_recommendation, que valida el nivel con las flags.';
create index recommendations_active_idx on public.recommendations (space_id, severity) where status = 'active';

create table public.recommendation_events (
  id bigint generated always as identity primary key,
  recommendation_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  event text not null check (event in ('shown', 'expanded', 'dismissed', 'resolved', 'feedback_useful', 'feedback_not_useful')),
  user_id uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  foreign key (recommendation_id, space_id) references public.recommendations (id, space_id) on delete cascade
);
comment on table public.recommendation_events is 'Historial de interacción con cada aviso. Solo inserción.';
create index recommendation_events_rec_idx on public.recommendation_events (space_id, recommendation_id, at desc);
create index recommendation_events_user_idx on public.recommendation_events (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- Invariantes: sumas de pesos (security definer: suman todas las filas, no solo las visibles)
-- ---------------------------------------------------------------------------
create function private.trg_validate_allocations() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_op uuid := coalesce(new.operation_id, old.operation_id);
  v_n bigint;
  v_sum bigint;
begin
  select count(*), coalesce(sum(a.weight_bps), 0) into v_n, v_sum
  from public.planned_operation_allocations a where a.operation_id = v_op;
  if v_n > 0 and v_sum <> 10000 then
    raise exception 'El reparto de la operación debe sumar 10000 pb (suma %)', v_sum using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger planned_operation_allocations_validate
  after insert or update or delete on public.planned_operation_allocations
  deferrable initially deferred for each row execute function private.trg_validate_allocations();

create function private.trg_validate_compositions() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_a uuid := coalesce(new.asset_id, old.asset_id);
  v_t date := coalesce(new.as_of, old.as_of);
  v_d text := coalesce(new.dimension, old.dimension);
  v_sum bigint;
begin
  select coalesce(sum(c.weight_bps), 0) into v_sum
  from public.asset_compositions c where c.asset_id = v_a and c.as_of = v_t and c.dimension = v_d;
  if v_sum > 10000 then
    raise exception 'La composición supera 10000 pb en %', v_d using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create constraint trigger asset_compositions_validate
  after insert or update or delete on public.asset_compositions
  deferrable initially deferred for each row execute function private.trg_validate_compositions();

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
do $$
begin
  perform private.secure_space_table('assumptions');
  perform private.secure_space_table('category_budgets');
  perform private.secure_space_table('recurring_rules');
  perform private.secure_space_table('categorization_rules');
  perform private.secure_space_table('tasks');
  perform private.secure_space_table('investment_plans');
  perform private.secure_space_table('planned_operations');
  perform private.secure_space_table('planned_operation_allocations');
  perform private.secure_space_table('asset_compositions');
  perform private.secure_space_table('risk_profiles');
  -- Avisos: lectura para todos los miembros; el usuario solo actualiza estado y motivo.
  -- La creación va por RPC (valida el nivel con las flags).
  perform private.secure_space_table('recommendations', p_crud => false);
  perform private.secure_space_table('recommendation_events', p_crud => false);
end $$;

-- El tipo de un plan es inmutable: una hipótesis no se convierte en calendario real (ni al revés).
revoke update (kind) on public.investment_plans from authenticated;

create policy recommendations_update on public.recommendations for update to authenticated
using (space_id = any ((select private.writable_space_ids())::uuid[]))
with check (space_id = any ((select private.writable_space_ids())::uuid[]));
grant update (status, dismissed_reason) on public.recommendations to authenticated;

-- Los eventos los insertan los miembros (sin asesores) a su nombre; no se modifican ni se borran.
create policy recommendation_events_insert on public.recommendation_events for insert to authenticated
with check (
  space_id = any ((select private.peer_space_ids())::uuid[])
  and user_id = (select auth.uid())
);
grant insert (recommendation_id, space_id, event, user_id) on public.recommendation_events to authenticated;

-- ---------------------------------------------------------------------------
-- RPC de avisos (security definer: un miembro de solo lectura también dispara la evaluación)
-- ---------------------------------------------------------------------------
create function public.upsert_recommendation(
  p_space_id uuid, p_rule_id text, p_rule_version integer, p_level smallint, p_severity text,
  p_inputs_hash bytea, p_inputs_snapshot jsonb, p_assumptions_snapshot jsonb,
  p_message_key text, p_message_params jsonb, p_confidence text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.can_read(p_space_id) then
    raise exception 'Sin acceso al espacio' using errcode = 'insufficient_privilege';
  end if;
  -- Doble barrera con el motor de reglas: el nivel debe estar activado para este espacio y país.
  if p_level not between 1 and 2 or not public.feature_enabled('reco.level' || p_level::text, p_space_id) then
    raise exception 'El nivel de aviso % no está activado para este espacio', p_level using errcode = 'insufficient_privilege';
  end if;
  insert into public.recommendations
    (space_id, rule_id, rule_version, level, severity, inputs_hash, inputs_snapshot, assumptions_snapshot,
     message_key, message_params, confidence)
  values
    (p_space_id, p_rule_id, p_rule_version, p_level, p_severity, p_inputs_hash,
     coalesce(p_inputs_snapshot, '{}'::jsonb), coalesce(p_assumptions_snapshot, '{}'::jsonb),
     p_message_key, coalesce(p_message_params, '{}'::jsonb), p_confidence)
  on conflict (space_id, rule_id, inputs_hash) do update set updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.upsert_recommendation is 'Registra un aviso (idempotente por regla + hash de entradas). Rechaza niveles desactivados por flags.';

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.upsert_recommendation from public, anon;
grant execute on function
  private.member_role(uuid), private.can_read(uuid), private.can_write(uuid), private.is_owner(uuid),
  private.space_ids_for_roles(public.app_role[]),
  private.readable_space_ids(), private.peer_space_ids(), private.writable_space_ids(), private.owned_space_ids(),
  private.has_verified_mfa(), private.meets_sensitive_aal(), private.is_valid_isin(text)
to authenticated;
grant execute on function public.upsert_recommendation to authenticated;

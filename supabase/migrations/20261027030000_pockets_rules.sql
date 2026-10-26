-- =============================================================================
-- 5 · Bolsillos, reglas del usuario, tramos de remuneración, comisiones con fuente y procedencia.
-- ADR-0017. Mismas reglas: FKs compuestas por espacio, RLS forzada, permisos mínimos.
-- El dinero se organiza por bolsillos (función), no por entidades. Las reglas son datos sobre un
-- catálogo cerrado de métricas (finance-core): no hay expresiones ni texto libre que se muestre.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Procedencia: quién introdujo un dato. Se fija en el servidor, no la elige el cliente.
-- ---------------------------------------------------------------------------
create function private.set_entered_by() returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- Con sesión de usuario, el autor es siempre quien escribe (también al editar el valor).
  new.entered_by := coalesce((select auth.uid()), new.entered_by);
  return new;
end;
$$;
comment on function private.set_entered_by is 'Fija entered_by con el usuario autenticado: la procedencia no la decide el cliente.';

alter table public.valuations
  add column entered_by uuid references auth.users (id) on delete set null,
  add column needs_verification boolean not null default false;
comment on column public.valuations.source is 'Origen: manual, csv, statement (extracto), price_feed o computed.';
comment on column public.valuations.entered_by is 'Quién introdujo el valor (usuario; nulo si lo creó un proceso). [pii]';
comment on column public.valuations.needs_verification is 'Marca de "pendiente de verificar" que la interfaz muestra junto a la cifra.';
create index valuations_entered_by_idx on public.valuations (entered_by) where entered_by is not null;
create trigger valuations_entered_by before insert or update on public.valuations
  for each row execute function private.set_entered_by();
grant update (needs_verification) on public.valuations to authenticated;

alter table public.asset_compositions
  add column entered_by uuid references auth.users (id) on delete set null,
  add column needs_verification boolean not null default false;
comment on column public.asset_compositions.entered_by is 'Quién introdujo la composición. [pii]';
comment on column public.asset_compositions.needs_verification is 'Pendiente de verificar contra la ficha del producto.';
create index asset_compositions_entered_by_idx on public.asset_compositions (entered_by) where entered_by is not null;
create trigger asset_compositions_entered_by before insert or update on public.asset_compositions
  for each row execute function private.set_entered_by();
grant update (needs_verification) on public.asset_compositions to authenticated;

-- ---------------------------------------------------------------------------
-- Comisión total anual (TER) como instantánea con fuente y fecha
-- ---------------------------------------------------------------------------
create table public.asset_fee_snapshots (
  asset_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  as_of date not null,
  ter_bps integer not null check (ter_bps between 0 and 10000),
  source text not null check (char_length(source) between 1 and 200),
  needs_verification boolean not null default false,
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (asset_id, as_of),
  foreign key (asset_id, space_id) references public.assets (id, space_id) on delete cascade
);
comment on table public.asset_fee_snapshots is 'Comisión total anual de un producto en una fecha, tomada de su ficha (fuente obligatoria). Alimenta el coste ponderado de la cartera; assets.ter_bps es el valor vigente que el usuario ve. [financiero]';
comment on column public.asset_fee_snapshots.entered_by is 'Quién introdujo el dato. [pii]';
create index asset_fee_snapshots_asset_idx on public.asset_fee_snapshots (space_id, asset_id, as_of desc);
create index asset_fee_snapshots_entered_by_idx on public.asset_fee_snapshots (entered_by) where entered_by is not null;
create trigger asset_fee_snapshots_entered_by before insert or update on public.asset_fee_snapshots
  for each row execute function private.set_entered_by();

-- ---------------------------------------------------------------------------
-- Remuneración del efectivo por tramos (nunca fijada en el código: los tipos cambian)
-- ---------------------------------------------------------------------------
create table public.cash_rate_tiers (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  account_id uuid not null,
  effective_from date not null,
  up_to_minor bigint check (up_to_minor between 1 and 1000000000000000),
  rate_bps integer not null check (rate_bps between 0 and 5000),
  currency char(3) not null references ref.currencies (code),
  source text not null check (char_length(source) between 1 and 200),
  needs_verification boolean not null default true,
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  unique nulls not distinct (account_id, effective_from, up_to_minor),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade
);
comment on table public.cash_rate_tiers is 'Tipo anual (TAE, pb) por tramo de saldo y fecha de inicio. up_to_minor nulo = resto del saldo. Siempre con fuente y, por defecto, marcado "verificar". [financiero]';
comment on column public.cash_rate_tiers.entered_by is 'Quién introdujo el tramo. [pii]';
create unique index cash_rate_tiers_rest_idx on public.cash_rate_tiers (account_id, effective_from) where up_to_minor is null;
create index cash_rate_tiers_account_idx on public.cash_rate_tiers (space_id, account_id, effective_from desc);
create index cash_rate_tiers_currency_idx on public.cash_rate_tiers (currency);
create index cash_rate_tiers_entered_by_idx on public.cash_rate_tiers (entered_by) where entered_by is not null;
create trigger cash_rate_tiers_entered_by before insert or update on public.cash_rate_tiers
  for each row execute function private.set_entered_by();

-- La moneda del tramo es la de la cuenta (el usuario la lee con su RLS: invoker).
create function private.trg_cash_tier_currency() returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_currency char(3);
begin
  select a.currency into v_currency from public.accounts a where a.id = new.account_id and a.space_id = new.space_id;
  -- Si la cuenta no existe (o es de otro espacio) responde la clave foránea, no este trigger.
  if found and new.currency <> v_currency then
    raise exception 'La moneda del tramo debe ser la de la cuenta' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger cash_rate_tiers_currency before insert or update on public.cash_rate_tiers
  for each row execute function private.trg_cash_tier_currency();

-- ---------------------------------------------------------------------------
-- Bolsillos: objetivos con dinero asignado
-- ---------------------------------------------------------------------------
create table public.pockets (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null default 'custom' check (kind in ('emergency', 'home', 'long_term', 'speculative', 'children', 'custom')),
  name text not null check (char_length(name) between 1 and 60),
  target_minor bigint check (target_minor between 0 and 1000000000000000),
  currency char(3) references ref.currencies (code),
  target_on date,
  risk_level text not null default 'medium' check (risk_level in ('none', 'low', 'medium', 'high', 'speculative')),
  horizon_years smallint check (horizon_years between 0 and 100),
  goal_id uuid,
  sort_order smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (goal_id, space_id) references public.goals (id, space_id) on delete set null (goal_id),
  check ((target_minor is null) = (currency is null)),
  check (target_on is null or target_minor is not null)
);
comment on table public.pockets is 'Bolsillo: función del dinero (colchón, casa, largo plazo, apuestas, hijas…) con objetivo opcional, riesgo permitido y horizonte. Las entidades solo son dónde está guardado. [financiero]';
comment on column public.pockets.risk_level is 'Riesgo máximo que el usuario admite para el contenido del bolsillo; finance-core lo traduce a umbrales (ADR-0017).';
comment on column public.pockets.goal_id is 'Objetivo de planificación asociado (jubilación, compra de vivienda…), si existe.';
create unique index pockets_name_idx on public.pockets (space_id, name) where archived_at is null;
create index pockets_space_idx on public.pockets (space_id, sort_order) where archived_at is null;
create index pockets_goal_idx on public.pockets (space_id, goal_id) where goal_id is not null;
create index pockets_currency_idx on public.pockets (currency) where currency is not null;

-- Parte de una cuenta (o de una posición) asignada a un bolsillo, en puntos básicos. Lo no asignado
-- es "efectivo sin función": la interfaz lo muestra y las reglas pueden avisar.
create table public.pocket_allocations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  pocket_id uuid not null,
  account_id uuid not null,
  asset_id uuid,
  weight_bps integer not null check (weight_bps between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (pocket_id, account_id, asset_id),
  foreign key (pocket_id, space_id) references public.pockets (id, space_id) on delete cascade,
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade,
  foreign key (asset_id, space_id) references public.assets (id, space_id) on delete cascade
);
comment on table public.pocket_allocations is 'Reparto de una cuenta (asset_id nulo) o de una posición entre bolsillos. Por destino la suma es ≤ 10000 pb; una cuenta se reparte entera o por posiciones, nunca de las dos formas. [financiero]';
create index pocket_allocations_pocket_idx on public.pocket_allocations (space_id, pocket_id);
create index pocket_allocations_account_idx on public.pocket_allocations (space_id, account_id);
create index pocket_allocations_asset_idx on public.pocket_allocations (space_id, asset_id) where asset_id is not null;

create function private.validate_pocket_allocations(p_space uuid, p_account uuid, p_asset uuid)
returns void
language plpgsql security definer set search_path = ''
-- security definer: lee todas las filas del destino aunque el usuario no las vea; solo valida y no devuelve datos.
as $$
declare
  v_sum bigint;
  v_account_level boolean;
  v_asset_level boolean;
begin
  select coalesce(sum(weight_bps), 0) into v_sum
  from public.pocket_allocations
  where space_id = p_space and account_id = p_account and asset_id is not distinct from p_asset;
  if v_sum > 10000 then
    raise exception 'Lo asignado a bolsillos supera el 100 %% (% pb)', v_sum using errcode = 'check_violation';
  end if;
  select bool_or(asset_id is null), bool_or(asset_id is not null) into v_account_level, v_asset_level
  from public.pocket_allocations
  where space_id = p_space and account_id = p_account;
  if v_account_level and v_asset_level then
    raise exception 'Una cuenta se reparte entera o por posiciones, no de las dos formas' using errcode = 'check_violation';
  end if;
end;
$$;

create function private.trg_pocket_allocations() returns trigger
language plpgsql security definer set search_path = ''
-- security definer: delega en validate_pocket_allocations; no expone datos.
as $$
begin
  if tg_op <> 'INSERT' then
    perform private.validate_pocket_allocations(old.space_id, old.account_id, old.asset_id);
  end if;
  if tg_op <> 'DELETE' then
    perform private.validate_pocket_allocations(new.space_id, new.account_id, new.asset_id);
  end if;
  return null;
end;
$$;
create constraint trigger pocket_allocations_validate
  after insert or update or delete on public.pocket_allocations
  deferrable initially deferred for each row execute function private.trg_pocket_allocations();

-- ---------------------------------------------------------------------------
-- Reglas del usuario: datos sobre un catálogo cerrado (ADR-0017). Generan avisos de nivel 2.
-- ---------------------------------------------------------------------------
create table public.advice_rules (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  template text not null check (template ~ '^[a-z0-9_.]{1,60}$'),
  scope text not null check (scope in ('space', 'pocket', 'account')),
  pocket_id uuid,
  account_id uuid,
  metric text not null check (metric ~ '^[a-z0-9_.]{1,60}$'),
  comparator text not null check (comparator in ('gt', 'gte', 'lt', 'lte')),
  threshold numeric(24, 10) not null,
  unit text not null check (unit in ('currency_minor', 'bps', 'ratio', 'months', 'years', 'days', 'count')),
  currency char(3) references ref.currencies (code),
  min_duration_days smallint not null default 0 check (min_duration_days between 0 and 3650),
  severity text not null default 'attention' check (severity in ('info', 'attention', 'important')),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  paused_on date,
  paused_reason text check (char_length(paused_reason) between 1 and 200),
  note text check (char_length(note) <= 200),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (pocket_id, space_id) references public.pockets (id, space_id) on delete cascade,
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade,
  check ((scope = 'pocket') = (pocket_id is not null)),
  check ((scope = 'account') = (account_id is not null)),
  check ((unit = 'currency_minor') = (currency is not null)),
  check ((status = 'paused') = (paused_on is not null and paused_reason is not null)),
  check (status = 'paused' or (paused_on is null and paused_reason is null))
);
comment on table public.advice_rules is 'Regla editable: plantilla y métrica del catálogo cerrado de finance-core + umbral, severidad y ámbito. El texto del aviso sale del catálogo de mensajes; note es solo una anotación del usuario. Se pausa con motivo y fecha, no se borra (archived). [financiero]';
comment on column public.advice_rules.template is 'Clave de la plantilla en finance-core (p. ej., emergency_fund_months). No es código ni expresión.';
comment on column public.advice_rules.version is 'Se incrementa al cambiar la condición; los avisos guardan la versión con la que se emitieron.';
comment on column public.advice_rules.note is 'Anotación libre y acotada del usuario; nunca forma parte del texto de los avisos. [pii]';
create index advice_rules_space_idx on public.advice_rules (space_id, status);
create index advice_rules_pocket_idx on public.advice_rules (space_id, pocket_id) where pocket_id is not null;
create index advice_rules_account_idx on public.advice_rules (space_id, account_id) where account_id is not null;
create index advice_rules_currency_idx on public.advice_rules (currency) where currency is not null;

create table public.advice_rule_revisions (
  id bigint generated always as identity primary key,
  rule_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  version integer not null,
  change text not null check (change in ('created', 'updated', 'paused', 'resumed', 'archived')),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 4096),
  foreign key (rule_id, space_id) references public.advice_rules (id, space_id) on delete cascade
);
comment on table public.advice_rule_revisions is 'Historial de cambios de cada regla (solo inserción, lo escribe un trigger). El snapshot excluye la anotación libre. [financiero]';
comment on column public.advice_rule_revisions.changed_by is 'Usuario que hizo el cambio. [pii]';
create index advice_rule_revisions_rule_idx on public.advice_rule_revisions (space_id, rule_id, id desc);
create index advice_rule_revisions_changed_by_idx on public.advice_rule_revisions (changed_by) where changed_by is not null;

create function private.trg_advice_rule_version() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.template, new.scope, new.pocket_id, new.account_id, new.metric, new.comparator, new.threshold,
      new.unit, new.currency, new.min_duration_days, new.severity)
     is distinct from
     (old.template, old.scope, old.pocket_id, old.account_id, old.metric, old.comparator, old.threshold,
      old.unit, old.currency, old.min_duration_days, old.severity) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;
create trigger advice_rules_version before update on public.advice_rules
  for each row execute function private.trg_advice_rule_version();

create function private.trg_advice_rule_revision() returns trigger
language plpgsql security definer set search_path = ''
-- security definer: el usuario no tiene permiso de escritura en el historial; solo este trigger lo escribe.
as $$
declare
  v_change text;
begin
  if tg_op = 'INSERT' then
    v_change := 'created';
  elsif new.status = 'archived' and old.status <> 'archived' then
    v_change := 'archived';
  elsif new.status = 'paused' and old.status <> 'paused' then
    v_change := 'paused';
  elsif new.status = 'active' and old.status = 'paused' then
    v_change := 'resumed';
  else
    v_change := 'updated';
  end if;
  insert into public.advice_rule_revisions (rule_id, space_id, version, change, changed_by, snapshot)
  values (new.id, new.space_id, new.version, v_change, (select auth.uid()),
          to_jsonb(new) - 'note' - 'created_at' - 'updated_at');
  return null;
end;
$$;
create trigger advice_rules_revision after insert or update on public.advice_rules
  for each row execute function private.trg_advice_rule_revision();

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
do $$
begin
  perform private.secure_space_table('asset_fee_snapshots');
  perform private.secure_space_table('cash_rate_tiers');
  perform private.secure_space_table('pockets');
  perform private.secure_space_table('pocket_allocations');
  -- Reglas: se crean y editan, no se borran (se archivan); el historial solo lo escribe el trigger.
  perform private.secure_space_table('advice_rules', p_crud => false);
  perform private.secure_space_table('advice_rule_revisions', p_crud => false);
end $$;

create policy advice_rules_insert on public.advice_rules for insert to authenticated
with check (space_id = any ((select private.writable_space_ids())::uuid[]));
create policy advice_rules_update on public.advice_rules for update to authenticated
using (space_id = any ((select private.writable_space_ids())::uuid[]))
with check (space_id = any ((select private.writable_space_ids())::uuid[]));
grant insert on public.advice_rules to authenticated;
grant update (template, scope, pocket_id, account_id, metric, comparator, threshold, unit, currency,
              min_duration_days, severity, status, paused_on, paused_reason, note)
  on public.advice_rules to authenticated;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución de las funciones nuevas
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.member_role(uuid), private.can_read(uuid), private.can_write(uuid), private.is_owner(uuid),
  private.space_ids_for_roles(public.app_role[]),
  private.readable_space_ids(), private.peer_space_ids(), private.writable_space_ids(), private.owned_space_ids(),
  private.has_verified_mfa(), private.meets_sensitive_aal(), private.is_valid_isin(text)
to authenticated;

-- =============================================================================
-- 2/5 · Cuentas, activos, libro de movimientos y valoraciones.
-- ADR-0005 (dinero), ADR-0006 (patas), docs/plan/15-revision-bd.md.
--
-- Integridad entre espacios: toda FK entre tablas con space_id es COMPUESTA
-- (xxx_id, space_id) contra un unique (id, space_id). Es imposible referenciar datos de
-- otro espacio, ni siquiera conociendo su id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Utilidad: aplica RLS forzada, políticas y permisos mínimos a una tabla con space_id.
-- Se usa solo en migraciones. Políticas: lectura por array de espacios; con p_crud,
-- escritura para propietarios y editores. UPDATE solo por columnas (sin id, space_id,
-- created_at ni columnas generadas): el espacio de una fila es inmutable.
-- ---------------------------------------------------------------------------
create function private.secure_space_table(
  p_table text, p_read text default 'readable', p_crud boolean default true
) returns void
language plpgsql set search_path = ''
as $$
declare
  v_cols text;
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('alter table public.%I force row level security', p_table);
  execute format('revoke all on public.%I from public, anon, authenticated', p_table);
  execute format(
    'create policy %I on public.%I for select to authenticated using (space_id = any ((select private.%I())::uuid[]))',
    p_table || '_select', p_table, p_read || '_space_ids');
  execute format('grant select on public.%I to authenticated', p_table);

  if p_crud then
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (space_id = any ((select private.writable_space_ids())::uuid[]))',
      p_table || '_insert', p_table);
    execute format(
      'create policy %I on public.%I for update to authenticated using (space_id = any ((select private.writable_space_ids())::uuid[])) with check (space_id = any ((select private.writable_space_ids())::uuid[]))',
      p_table || '_update', p_table);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (space_id = any ((select private.writable_space_ids())::uuid[]))',
      p_table || '_delete', p_table);
    execute format('grant insert, delete on public.%I to authenticated', p_table);
    select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p_table and c.is_generated = 'NEVER'
      and c.column_name not in ('id', 'space_id', 'created_at', 'updated_at');
    if v_cols is not null then
      execute format('grant update (%s) on public.%I to authenticated', v_cols, p_table);
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = p_table and c.column_name = 'updated_at'
  ) then
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
      p_table || '_touch', p_table);
  end if;
end;
$$;
comment on function private.secure_space_table is 'Aplica RLS forzada + políticas + permisos mínimos a una tabla con space_id (solo migraciones).';

-- ---------------------------------------------------------------------------
-- Personas (titulares; no son usuarios)
-- ---------------------------------------------------------------------------
create table public.persons (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  kind text not null check (kind in ('adult', 'minor')),
  birth_year smallint check (birth_year between 1900 and 2100),
  linked_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id)
);
comment on table public.persons is 'Titulares y beneficiarios de cuentas (adultos y menores). No son usuarios salvo linked_user_id. [pii]';
comment on column public.persons.display_name is 'Nombre o alias. [pii] [menor si kind=minor]';
comment on column public.persons.birth_year is 'Solo el año, opcional (minimización). [pii]';
create index persons_space_idx on public.persons (space_id);
create unique index persons_linked_user_idx on public.persons (space_id, linked_user_id) where linked_user_id is not null;
create index persons_linked_user_fk_idx on public.persons (linked_user_id) where linked_user_id is not null;

-- ---------------------------------------------------------------------------
-- Entidades: dónde está guardado el dinero
-- ---------------------------------------------------------------------------
create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'bank' check (kind in (
    'bank', 'broker', 'fund_manager', 'pension_manager', 'insurer', 'exchange', 'other')),
  country_code char(2) check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  unique (space_id, name)
);
comment on table public.institutions is 'Entidad donde está guardado el dinero (banco, bróker, gestora, aseguradora, exchange). Una sola fila por entidad: la concentración por entidad y el límite del fondo de garantía (por entidad y titular) se calculan sobre ella. El país señala cuentas en el extranjero (información fiscal). [financiero]';

-- ---------------------------------------------------------------------------
-- Cuentas
-- ---------------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in (
    'current', 'savings', 'deposit', 'cash', 'brokerage', 'fund_holding', 'pension_plan', 'crypto',
    'real_estate', 'vehicle', 'other_asset', 'mortgage', 'loan', 'credit_card')),
  is_liability boolean generated always as (kind in ('mortgage', 'loan', 'credit_card')) stored,
  currency char(3) not null references ref.currencies (code),
  institution_id uuid,
  iban_last4 text check (iban_last4 ~ '^[0-9A-Za-z]{4}$'),
  liquidity text not null default 'immediate' check (liquidity in ('immediate', 'days', 'months', 'illiquid')),
  tax_wrapper text not null default 'none' check (tax_wrapper in (
    'none', 'fund_transferable', 'pension_plan', 'pias', 'sialp', 'unit_linked', 'other')),
  scope text not null default 'household' check (scope in ('household', 'external')),
  opened_on date,
  closed_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (institution_id, space_id) references public.institutions (id, space_id) on delete set null (institution_id),
  check (closed_on is null or opened_on is null or closed_on >= opened_on)
);
comment on table public.accounts is 'Cuentas, posiciones agrupadas por entidad, inmuebles y deudas. [financiero]';
comment on column public.accounts.name is 'Nombre que pone el usuario; puede incluir nombres propios. [pii]';
comment on column public.accounts.scope is 'household = cuenta del hogar (entra en patrimonio y cálculos); external = dato ajeno que solo se muestra aparte (p. ej., cuentas de menores a nombre de otra persona).';
comment on column public.accounts.iban_last4 is 'Solo los 4 últimos caracteres, opcional. Nunca el IBAN completo. [pii]';
create index accounts_space_idx on public.accounts (space_id);
create index accounts_currency_idx on public.accounts (currency);
create index accounts_institution_idx on public.accounts (space_id, institution_id) where institution_id is not null;

create table public.account_holders (
  account_id uuid not null,
  person_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  role text not null default 'holder' check (role in ('holder', 'beneficiary')),
  share_bps integer check (share_bps between 1 and 10000),
  primary key (account_id, person_id),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade,
  foreign key (person_id, space_id) references public.persons (id, space_id) on delete cascade,
  check ((role = 'holder') = (share_bps is not null))
);
comment on table public.account_holders is 'Titularidad legal (holder, con porcentaje; suman 10000 pb por cuenta) y beneficiarios económicos (beneficiary). [pii] [menor]';
create index account_holders_account_idx on public.account_holders (space_id, account_id);
create index account_holders_person_idx on public.account_holders (space_id, person_id);

create table public.loan_terms (
  account_id uuid primary key,
  space_id uuid not null references public.spaces (id) on delete cascade,
  principal_minor bigint not null check (principal_minor > 0),
  rate_type text not null check (rate_type in ('fixed', 'variable', 'mixed')),
  annual_rate numeric(9, 6) not null check (annual_rate between 0 and 1),
  index_name text check (char_length(index_name) <= 40),
  spread numeric(9, 6),
  term_months integer not null check (term_months between 1 and 600),
  start_on date not null,
  first_payment_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade
);
comment on table public.loan_terms is 'Condiciones de préstamos e hipotecas (1:1 con cuentas de deuda). [financiero]';
create index loan_terms_space_idx on public.loan_terms (space_id, account_id);

-- Historial del tipo de un préstamo (revisiones de una hipoteca variable o mixta). loan_terms guarda
-- las condiciones iniciales; el tipo vigente en una fecha es el del periodo con mayor effective_from.
create table public.loan_rate_periods (
  account_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  effective_from date not null,
  annual_rate numeric(9, 6) not null check (annual_rate between 0 and 1),
  index_value numeric(9, 6),
  source text check (char_length(source) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, effective_from),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade
);
comment on table public.loan_rate_periods is 'Tipo anual de un préstamo desde cada revisión (p. ej., euríbor + diferencial). Permite recalcular cuotas e intereses pasados. [financiero]';
comment on column public.loan_rate_periods.index_value is 'Valor del índice de referencia aplicado en la revisión, si lo hay.';
create index loan_rate_periods_space_idx on public.loan_rate_periods (space_id, account_id, effective_from desc);

-- ---------------------------------------------------------------------------
-- Activos
-- ---------------------------------------------------------------------------
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null check (kind in (
    'equity', 'etf', 'mutual_fund', 'pension_fund', 'bond', 'crypto', 'real_estate', 'commodity', 'other')),
  name text not null check (char_length(name) between 1 and 120),
  isin char(12) check (private.is_valid_isin(isin::text)),
  ticker text check (char_length(ticker) <= 20),
  mic text check (mic ~ '^[A-Z]{4}$'),
  currency char(3) not null references ref.currencies (code),
  asset_class text not null check (asset_class in (
    'equity', 'fixed_income', 'cash', 'real_estate', 'crypto', 'commodity', 'mixed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id)
);
comment on column public.assets.name is 'Nombre del producto; en activos sin catálogo puede ser texto libre. [pii]';
comment on table public.assets is 'Activos que el usuario posee o compara (fondos, ETF, acciones, cripto, carteras alternativas…). Coste, riesgo y composición viven en fichas con fuente y fecha (asset_fact_sheets, asset_compositions).';
comment on column public.assets.asset_class is 'Clase principal. Un mixto detalla su reparto real en asset_compositions (dimensión asset_class).';
create unique index assets_isin_idx on public.assets (space_id, isin) where isin is not null;
create index assets_space_idx on public.assets (space_id);
create index assets_currency_idx on public.assets (currency);

-- ---------------------------------------------------------------------------
-- Categorías de ingresos y gastos (definidas por el usuario)
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('income', 'expense')),
  parent_id uuid,
  essential boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  unique (space_id, kind, name),
  foreign key (parent_id, space_id) references public.categories (id, space_id) on delete set null (parent_id),
  check (parent_id is null or parent_id <> id),
  check (kind = 'expense' or not essential)
);
comment on table public.categories is 'Categorías de ingresos y gastos de dos niveles como máximo. essential marca el gasto básico (base del colchón). Las elige el usuario: no se infieren categorías sensibles a partir de comercios. [financiero]';
comment on column public.categories.name is 'Nombre libre elegido por el usuario; una categoría como "salud" o "donaciones" puede revelar datos de categoría especial (art. 9 RGPD). [pii]';
create index categories_space_idx on public.categories (space_id, kind) where archived_at is null;
create index categories_parent_idx on public.categories (space_id, parent_id) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- Libro de movimientos: transacciones con patas (ADR-0006)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  kind text not null check (kind in (
    'contribution', 'withdrawal', 'internal_transfer', 'buy', 'sell', 'dividend', 'interest', 'fee', 'tax',
    'fund_switch', 'loan_payment', 'income', 'expense', 'opening_balance', 'adjustment')),
  occurred_on date not null,
  description text check (char_length(description) <= 200),
  status text not null default 'settled' check (status in ('settled', 'pending')),
  source text not null default 'manual' check (source in ('manual', 'csv', 'statement', 'computed')),
  entered_by uuid references auth.users (id) on delete set null,
  reverses_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (reverses_id, space_id) references public.transactions (id, space_id)
);
comment on table public.transactions is 'Cabecera de movimiento. Solo se escribe mediante las RPC create/reverse/delete_transaction. [financiero]';
comment on column public.transactions.description is 'Texto libre acotado; puede contener datos personales del extracto. Opcional. [pii]';
comment on column public.transactions.source is 'Origen del movimiento: manual, csv, statement (extracto) o computed. Las filas importadas enlazan además con import_rows.';
comment on column public.transactions.entered_by is 'Quién lo registró (lo fija la RPC con el usuario autenticado). [pii]';
comment on column public.transactions.status is 'pending = en curso (p. ej., traspaso entre gestoras); los cálculos indican si lo incluyen.';
create index transactions_space_date_idx on public.transactions (space_id, occurred_on desc, id);
create unique index transactions_reverses_idx on public.transactions (space_id, reverses_id) where reverses_id is not null;
create index transactions_pending_idx on public.transactions (space_id) where status = 'pending';
create index transactions_entered_by_idx on public.transactions (entered_by) where entered_by is not null;

create table public.transaction_legs (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  role text not null check (role in ('cash', 'position', 'external', 'fee', 'tax')),
  account_id uuid,
  charged_account_id uuid,
  asset_id uuid,
  category_id uuid,
  quantity numeric(38, 12),
  amount_minor bigint not null check (amount_minor between -1000000000000000 and 1000000000000000),
  currency char(3) not null references ref.currencies (code),
  fx_rate numeric(20, 10) check (fx_rate > 0),
  created_at timestamptz not null default now(),
  foreign key (transaction_id, space_id) references public.transactions (id, space_id) on delete cascade,
  foreign key (category_id, space_id) references public.categories (id, space_id),
  foreign key (account_id, space_id) references public.accounts (id, space_id),
  foreign key (charged_account_id, space_id) references public.accounts (id, space_id),
  foreign key (asset_id, space_id) references public.assets (id, space_id),
  check (
    (role = 'cash' and account_id is not null and asset_id is null and quantity is null)
    or (role = 'position' and account_id is not null and asset_id is not null and quantity is not null)
    or (role = 'external' and account_id is null and asset_id is null and quantity is null)
    or (role in ('fee', 'tax') and account_id is null and asset_id is null and quantity is null)
  ),
  check (charged_account_id is null or role in ('fee', 'tax')),
  -- La categoría va en la pata externa: un gasto puede dividirse en varias categorías (varias patas).
  check (category_id is null or role = 'external')
);
comment on table public.transaction_legs is 'Patas de un movimiento: por moneda suman 0. external/fee/tax son flujos que cruzan el borde del espacio. [financiero]';
comment on column public.transaction_legs.role is 'cash = efectivo de una cuenta; position = posición en un activo; external = dinero que entra o sale del espacio; fee/tax = coste.';
create index transaction_legs_tx_idx on public.transaction_legs (transaction_id, space_id);
-- Sin predicado: además de los saldos por cuenta, sirve al borrado en cascada de un espacio.
create index transaction_legs_account_idx on public.transaction_legs (space_id, account_id)
  include (transaction_id, role, amount_minor, currency);
create index transaction_legs_asset_idx on public.transaction_legs (space_id, asset_id)
  where asset_id is not null;
create index transaction_legs_charged_idx on public.transaction_legs (space_id, charged_account_id)
  where charged_account_id is not null;
create index transaction_legs_category_idx on public.transaction_legs (space_id, category_id)
  where category_id is not null;
create index transaction_legs_currency_idx on public.transaction_legs (currency);

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  account_id uuid not null,
  asset_id uuid,
  as_of date not null,
  value_minor bigint not null check (value_minor between 0 and 1000000000000000),
  currency char(3) not null references ref.currencies (code),
  source text not null default 'manual' check (source in ('manual', 'csv', 'statement', 'price_feed', 'computed')),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade,
  foreign key (asset_id, space_id) references public.assets (id, space_id) on delete cascade,
  unique nulls not distinct (account_id, asset_id, as_of)
);
comment on column public.valuations.note is 'Anotación libre del usuario. [pii]';
comment on table public.valuations is 'Valor de una cuenta (asset_id nulo) o posición en una fecha. Importes positivos: en deudas, el saldo pendiente. [financiero]';
create index valuations_account_idx on public.valuations (space_id, account_id, as_of desc);
create index valuations_asset_idx on public.valuations (space_id, asset_id) where asset_id is not null;
create index valuations_currency_idx on public.valuations (currency);

-- ---------------------------------------------------------------------------
-- Referencia: tipos de cambio e inflación
-- ---------------------------------------------------------------------------
create table ref.fx_rates (
  base char(3) not null references ref.currencies (code),
  quote char(3) not null references ref.currencies (code),
  as_of date not null,
  rate numeric(20, 10) not null check (rate > 0),
  source text not null,
  primary key (base, quote, as_of),
  check (base <> quote)
);
comment on table ref.fx_rates is '1 base = rate quote en as_of. Fuente: tipos de referencia del BCE.';
create index fx_rates_quote_idx on ref.fx_rates (quote);

create table ref.inflation_index (
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  period date not null check (extract(day from period) = 1),
  index_value numeric(12, 4) not null check (index_value > 0),
  series_code text not null,
  published_on date,
  primary key (country, period)
);
comment on table ref.inflation_index is 'Índice de precios al consumo por país y mes (primer día). Fuente: INE para España.';

-- Parámetros legales y fiscales por país y ejercicio (límites de aportación, tramos, mínimos…).
-- Ninguna cifra legal vive en el código: sale de aquí, siempre con su fuente y fecha de verificación.
create table ref.tax_parameters (
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  fiscal_year smallint not null check (fiscal_year between 2000 and 2100),
  key text not null check (key ~ '^[a-z0-9_.]{1,80}$'),
  value jsonb not null check (pg_column_size(value) <= 8192),
  source_url text not null check (source_url ~ '^https://' and char_length(source_url) <= 500),
  verified_on date not null,
  note text check (char_length(note) <= 300),
  primary key (country, fiscal_year, key)
);
comment on table ref.tax_parameters is 'Parámetros legales por país y ejercicio con fuente oficial (BOE, AEAT) y fecha de verificación. Los cálculos fiscales son informativos y dicen de qué ejercicio y fuente sale cada cifra.';

alter table ref.tax_parameters enable row level security;
alter table ref.tax_parameters force row level security;
create policy tax_parameters_read on ref.tax_parameters for select to authenticated using (true);
revoke all on ref.tax_parameters from public, anon, authenticated;
grant select on ref.tax_parameters to authenticated;
grant select, insert, update, delete on ref.tax_parameters to service_role;
create view public.tax_parameters with (security_invoker = true) as
  select country, fiscal_year, key, value, source_url, verified_on, note from ref.tax_parameters;
revoke all on public.tax_parameters from public, anon, authenticated;
grant select on public.tax_parameters to authenticated;

alter table ref.fx_rates enable row level security;
alter table ref.fx_rates force row level security;
alter table ref.inflation_index enable row level security;
alter table ref.inflation_index force row level security;
create policy fx_rates_read on ref.fx_rates for select to authenticated using (true);
create policy inflation_index_read on ref.inflation_index for select to authenticated using (true);
revoke all on ref.fx_rates, ref.inflation_index from public, anon, authenticated;
grant select on ref.fx_rates, ref.inflation_index to authenticated;
grant select, insert, update, delete on ref.fx_rates, ref.inflation_index to service_role;

create view public.fx_rates with (security_invoker = true) as
  select base, quote, as_of, rate, source from ref.fx_rates;
create view public.inflation_index with (security_invoker = true) as
  select country, period, index_value, series_code, published_on from ref.inflation_index;
revoke all on public.fx_rates, public.inflation_index from public, anon, authenticated;
grant select on public.fx_rates, public.inflation_index to authenticated;

-- ---------------------------------------------------------------------------
-- Invariantes del libro (security definer: deben ver todas las filas, no solo las del invocador)
-- ---------------------------------------------------------------------------
create function private.validate_transaction(p_tx uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text;
  v_n bigint;
  v_ext bigint;
  v_bad_cash boolean;
  v_bad_cat boolean;
  v_bad_cur text;
  v_bad_total bigint;
begin
  select t.kind into v_kind from public.transactions t where t.id = p_tx;
  if not found then
    return; -- borrada (cascada)
  end if;
  -- Una sola pasada por las patas de la transacción (índice por transaction_id).
  select count(*),
         count(*) filter (where l.role = 'external'),
         coalesce(bool_or(l.role = 'cash' and a.currency <> l.currency), false),
         coalesce(bool_or(v_kind in ('income', 'expense') and l.category_id is not null and c.kind <> v_kind), false)
    into v_n, v_ext, v_bad_cash, v_bad_cat
  from public.transaction_legs l
  left join public.accounts a on a.id = l.account_id and a.space_id = l.space_id
  left join public.categories c on c.id = l.category_id and c.space_id = l.space_id
  where l.transaction_id = p_tx;
  if v_n < 2 then
    raise exception 'La transacción necesita al menos dos patas' using errcode = 'check_violation';
  end if;
  select l.currency, sum(l.amount_minor) into v_bad_cur, v_bad_total
  from public.transaction_legs l
  where l.transaction_id = p_tx
  group by l.currency
  having sum(l.amount_minor) <> 0
  limit 1;
  if found then
    raise exception 'La transacción no cuadra en %: las patas suman %', v_bad_cur, v_bad_total
      using errcode = 'check_violation';
  end if;
  if v_bad_cash then
    raise exception 'La pata de efectivo debe estar en la moneda de su cuenta' using errcode = 'check_violation';
  end if;
  if v_bad_cat then
    raise exception 'La categoría debe ser del mismo tipo que el movimiento (ingreso o gasto)' using errcode = 'check_violation';
  end if;
  -- Un traspaso, canje de fondos, compra o venta nunca mueve dinero hacia/desde fuera del espacio:
  -- así no puede contarse como aportación ni como retirada.
  if v_kind in ('internal_transfer', 'fund_switch', 'buy', 'sell') and v_ext > 0 then
    raise exception 'Un movimiento de tipo % no puede tener patas externas', v_kind using errcode = 'check_violation';
  end if;
  if v_kind in ('contribution', 'withdrawal', 'income', 'expense', 'dividend', 'interest', 'opening_balance')
     and v_ext = 0 then
    raise exception 'Un movimiento de tipo % necesita una pata externa', v_kind using errcode = 'check_violation';
  end if;
end;
$$;
comment on function private.validate_transaction is 'Cuadre por moneda, coherencia de monedas y reglas por tipo (traspaso ≠ aportación). Dos consultas por validación. Se ejecuta al final de la transacción SQL. Tras cargas masivas (miles de movimientos) conviene ANALYZE: sin estadísticas el planificador puede elegir recorridos completos.';

create function private.trg_validate_tx_from_leg() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.validate_transaction(coalesce(new.transaction_id, old.transaction_id));
  return null;
end;
$$;
create function private.trg_validate_tx_from_tx() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.validate_transaction(new.id);
  return null;
end;
$$;
create constraint trigger transaction_legs_validate
  after insert or update or delete on public.transaction_legs
  deferrable initially deferred for each row execute function private.trg_validate_tx_from_leg();
create constraint trigger transactions_validate
  after insert or update of kind on public.transactions
  deferrable initially deferred for each row execute function private.trg_validate_tx_from_tx();

-- Las patas son inmutables: solo se crean con su transacción o se borran con ella.
create function private.forbid_leg_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'Las patas de un movimiento no se modifican: revierte el movimiento' using errcode = 'insufficient_privilege';
end;
$$;
create trigger transaction_legs_immutable before update on public.transaction_legs
  for each row execute function private.forbid_leg_update();

-- Solo se pueden editar descripción, estado (pendiente → liquidado) y, con límites, la fecha.
create function private.guard_transaction_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.space_id, new.kind, new.reverses_id, new.source, new.entered_by, new.created_at) is distinct from
     (old.space_id, old.kind, old.reverses_id, old.source, old.entered_by, old.created_at) then
    raise exception 'Columnas inmutables de la transacción' using errcode = 'insufficient_privilege';
  end if;
  if old.status = 'settled' and new.status = 'pending' then
    raise exception 'Un movimiento liquidado no puede volver a pendiente' using errcode = 'check_violation';
  end if;
  if new.occurred_on is distinct from old.occurred_on
     and old.status = 'settled' and old.created_at < now() - interval '24 hours' then
    raise exception 'No se cambia la fecha de un movimiento liquidado hace más de 24 h: revierte y crea otro'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger transactions_guard before update on public.transactions
  for each row execute function private.guard_transaction_update();

-- Titularidad: los titulares de una cuenta suman exactamente 10000 pb (si hay alguno).
create function private.validate_account_holders(p_account uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
  v_sum integer;
begin
  select count(*), coalesce(sum(h.share_bps), 0) into v_n, v_sum
  from public.account_holders h where h.account_id = p_account and h.role = 'holder';
  if v_n > 0 and v_sum <> 10000 then
    raise exception 'Los titulares de la cuenta deben sumar 10000 pb (suman %)', v_sum using errcode = 'check_violation';
  end if;
end;
$$;
create function private.trg_validate_holders() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.validate_account_holders(coalesce(new.account_id, old.account_id));
  return null;
end;
$$;
create constraint trigger account_holders_validate
  after insert or update or delete on public.account_holders
  deferrable initially deferred for each row execute function private.trg_validate_holders();

-- Las condiciones de préstamo solo cuelgan de cuentas de deuda.
create function private.guard_loan_terms() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.accounts a where a.id = new.account_id and a.is_liability) then
    raise exception 'Las condiciones de préstamo requieren una cuenta de deuda' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger loan_terms_guard before insert or update on public.loan_terms
  for each row execute function private.guard_loan_terms();
create trigger loan_rate_periods_guard before insert or update on public.loan_rate_periods
  for each row execute function private.guard_loan_terms();

-- Categorías: dos niveles como máximo y el hijo hereda el tipo del padre.
create function private.guard_category() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent record;
begin
  if new.parent_id is not null then
    select c.kind, c.parent_id into v_parent from public.categories c
    where c.id = new.parent_id and c.space_id = new.space_id;
    if v_parent.parent_id is not null then
      raise exception 'Las categorías admiten dos niveles como máximo' using errcode = 'check_violation';
    end if;
    if v_parent.kind <> new.kind then
      raise exception 'Una subcategoría debe ser del mismo tipo que su categoría padre' using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.categories c where c.parent_id = new.id and c.space_id = new.space_id) then
      raise exception 'Una categoría con subcategorías no puede colgar de otra' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger categories_guard before insert or update on public.categories
  for each row execute function private.guard_category();

-- Auditoría de altas y bajas de cuentas (sin nombres ni importes).
create function private.audit_accounts() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.log_event('account.created', 'account', new.id::text, new.space_id,
      jsonb_build_object('kind', new.kind, 'scope', new.scope));
  else
    perform audit.log_event('account.deleted', 'account', old.id::text, old.space_id,
      jsonb_build_object('kind', old.kind));
  end if;
  return null;
end;
$$;
create trigger accounts_audit after insert or delete on public.accounts
  for each row execute function private.audit_accounts();

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
do $$
begin
  perform private.secure_space_table('persons');
  perform private.secure_space_table('institutions');
  perform private.secure_space_table('accounts');
  perform private.secure_space_table('account_holders');
  perform private.secure_space_table('loan_terms');
  perform private.secure_space_table('loan_rate_periods');
  perform private.secure_space_table('assets');
  perform private.secure_space_table('categories');
  perform private.secure_space_table('valuations');
  -- Libro: lectura por RLS; escritura solo por RPC. transactions admite actualizar tres columnas.
  perform private.secure_space_table('transactions', p_crud => false);
  perform private.secure_space_table('transaction_legs', p_crud => false);
end $$;
-- El tipo de una categoría es inmutable (cambiarlo invertiría el sentido de sus importes).
revoke update (kind) on public.categories from authenticated;

create policy transactions_update on public.transactions for update to authenticated
using (space_id = any ((select private.writable_space_ids())::uuid[]))
with check (space_id = any ((select private.writable_space_ids())::uuid[]));
grant update (description, status, occurred_on) on public.transactions to authenticated;

-- ---------------------------------------------------------------------------
-- RPC del libro (security definer: la única vía de escritura; comprueban permisos explícitamente)
-- ---------------------------------------------------------------------------
create function public.create_transaction(
  p_space_id uuid, p_kind text, p_occurred_on date, p_legs jsonb,
  p_description text default null, p_status text default 'settled', p_source text default 'manual'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_tx uuid;
  v_n integer;
begin
  if not private.can_write(p_space_id) then
    raise exception 'Sin permiso de escritura en el espacio' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_legs) is distinct from 'array' then
    raise exception 'p_legs debe ser un array JSON' using errcode = 'invalid_parameter_value';
  end if;
  v_n := jsonb_array_length(p_legs);
  if v_n < 2 or v_n > 100 then
    raise exception 'Una transacción lleva entre 2 y 100 patas' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.transactions (space_id, kind, occurred_on, description, status, source, entered_by)
  values (p_space_id, p_kind, p_occurred_on, p_description, p_status, p_source, (select auth.uid()))
  returning id into v_tx;
  -- space_id sale siempre del parámetro verificado: el JSON no puede elegir espacio.
  insert into public.transaction_legs
    (transaction_id, space_id, role, account_id, charged_account_id, asset_id, category_id, quantity, amount_minor, currency, fx_rate)
  select v_tx, p_space_id, x.role, x.account_id, x.charged_account_id, x.asset_id, x.category_id, x.quantity, x.amount_minor, x.currency, x.fx_rate
  from jsonb_to_recordset(p_legs) as x(
    role text, account_id uuid, charged_account_id uuid, asset_id uuid, category_id uuid,
    quantity numeric, amount_minor bigint, currency text, fx_rate numeric);
  perform private.validate_transaction(v_tx); -- error claro ya; el disparador diferido lo repite al final
  return v_tx;
end;
$$;
comment on function public.create_transaction is 'Crea un movimiento con sus patas de forma atómica. bigint y numeric pueden llegar como cadenas JSON.';

create function public.reverse_transaction(
  p_tx_id uuid, p_occurred_on date default null, p_description text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_t public.transactions;
  v_new uuid;
  v_on date;
begin
  select t.* into v_t from public.transactions t where t.id = p_tx_id;
  if not found or not private.can_write(v_t.space_id) then
    raise exception 'Movimiento no encontrado o sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_t.reverses_id is not null then
    raise exception 'Una reversión no se revierte: crea un movimiento nuevo' using errcode = 'check_violation';
  end if;
  v_on := coalesce(p_occurred_on,
    (now() at time zone (select s.timezone from public.spaces s where s.id = v_t.space_id))::date);
  begin
    insert into public.transactions (space_id, kind, occurred_on, description, status, source, entered_by, reverses_id)
    values (v_t.space_id, v_t.kind, v_on, coalesce(p_description, 'Reversión'), 'settled', 'manual', (select auth.uid()), v_t.id)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'El movimiento ya fue revertido' using errcode = 'check_violation';
  end;
  insert into public.transaction_legs
    (transaction_id, space_id, role, account_id, charged_account_id, asset_id, category_id, quantity, amount_minor, currency, fx_rate)
  select v_new, l.space_id, l.role, l.account_id, l.charged_account_id, l.asset_id, l.category_id,
         -l.quantity, -l.amount_minor, l.currency, l.fx_rate
  from public.transaction_legs l where l.transaction_id = v_t.id;
  perform private.validate_transaction(v_new);
  perform audit.log_event('transaction.reversed', 'transaction', v_new::text, v_t.space_id,
    jsonb_build_object('reverses', v_t.id, 'kind', v_t.kind));
  return v_new;
end;
$$;

create function public.delete_transaction(p_tx_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_t public.transactions;
begin
  select t.* into v_t from public.transactions t where t.id = p_tx_id;
  if not found or not private.can_write(v_t.space_id) then
    raise exception 'Movimiento no encontrado o sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_t.created_at < now() - interval '24 hours' then
    raise exception 'Solo se borran movimientos de las últimas 24 h: revierte el movimiento' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.transactions r where r.reverses_id = v_t.id) then
    raise exception 'El movimiento tiene una reversión y no se puede borrar' using errcode = 'check_violation';
  end if;
  delete from public.transactions where id = v_t.id;
  perform audit.log_event('transaction.deleted', 'transaction', v_t.id::text, v_t.space_id,
    jsonb_build_object('kind', v_t.kind));
end;
$$;

-- Totales por categoría en un periodo. Solo movimientos de tipo ingreso o gasto: los traspasos entre
-- cuentas propias, las aportaciones y las compras de inversión no son ingresos ni gastos.
-- Importes positivos en el sentido natural (gasto = dinero que sale; ingreso = dinero que entra);
-- los reembolsos restan. category_id nulo = sin categoría.
create function public.category_totals(
  p_space_id uuid, p_from date, p_to date, p_include_pending boolean default false
) returns table (category_id uuid, flow text, currency char(3), amount_minor bigint, n bigint)
language sql stable set search_path = ''
as $$
  select l.category_id, t.kind, l.currency,
         (case when t.kind = 'expense' then sum(l.amount_minor) else -sum(l.amount_minor) end)::bigint,
         count(*)
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where l.space_id = p_space_id and l.role = 'external' and t.kind in ('income', 'expense')
    and t.occurred_on >= p_from and t.occurred_on <= p_to
    and (p_include_pending or t.status = 'settled')
  group by l.category_id, t.kind, l.currency;
$$;

-- Ingresos y gastos por mes natural (fechas contables, sin zona horaria).
create function public.monthly_cashflow(
  p_space_id uuid, p_from date, p_to date, p_include_pending boolean default false
) returns table (month date, currency char(3), income_minor bigint, expense_minor bigint)
language sql stable set search_path = ''
as $$
  select date_trunc('month', t.occurred_on)::date, l.currency,
         coalesce(-sum(l.amount_minor) filter (where t.kind = 'income'), 0)::bigint,
         coalesce(sum(l.amount_minor) filter (where t.kind = 'expense'), 0)::bigint
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where l.space_id = p_space_id and l.role = 'external' and t.kind in ('income', 'expense')
    and t.occurred_on >= p_from and t.occurred_on <= p_to
    and (p_include_pending or t.status = 'settled')
  group by 1, 2
  order by 1, 2;
$$;

-- Categorías iniciales neutras (idempotente). Deliberadamente SIN categorías que revelen datos de
-- categoría especial (salud, donaciones, cuotas sindicales o políticas): si el usuario las quiere,
-- las crea él (docs/plan/07).
create function public.seed_default_categories(p_space_id uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  if not private.can_write(p_space_id) then
    raise exception 'Sin permiso de escritura en el espacio' using errcode = 'insufficient_privilege';
  end if;
  insert into public.categories (space_id, name, kind, essential, sort_order)
  select p_space_id, d.name, d.kind, d.essential, d.ord
  from (values
    ('Nómina', 'income', false, 10),
    ('Ingresos de actividad', 'income', false, 20),
    ('Pensiones y prestaciones', 'income', false, 30),
    ('Otros ingresos', 'income', false, 40),
    ('Vivienda', 'expense', true, 10),
    ('Suministros', 'expense', true, 20),
    ('Alimentación', 'expense', true, 30),
    ('Transporte', 'expense', true, 40),
    ('Seguros', 'expense', true, 50),
    ('Educación y cuidado de hijos', 'expense', true, 60),
    ('Impuestos y tasas', 'expense', true, 70),
    ('Hogar y reparaciones', 'expense', false, 80),
    ('Restaurantes y ocio', 'expense', false, 90),
    ('Ropa y compras', 'expense', false, 100),
    ('Suscripciones', 'expense', false, 110),
    ('Viajes', 'expense', false, 120),
    ('Regalos', 'expense', false, 130),
    ('Otros gastos', 'expense', false, 140)
  ) as d(name, kind, essential, ord)
  on conflict (space_id, kind, name) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Saldos agregados en el servidor (security invoker: aplican la RLS del usuario).
create function public.account_cash_balances(
  p_space_id uuid, p_on date default null, p_include_pending boolean default false
) returns table (account_id uuid, currency char(3), balance_minor bigint)
language sql stable set search_path = ''
as $$
  select l.account_id, l.currency, sum(l.amount_minor)::bigint
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where l.space_id = p_space_id and l.role = 'cash'
    and (p_on is null or t.occurred_on <= p_on)
    and (p_include_pending or t.status = 'settled')
  group by l.account_id, l.currency;
$$;

create function public.position_balances(
  p_space_id uuid, p_on date default null, p_include_pending boolean default false
) returns table (account_id uuid, asset_id uuid, quantity numeric, cost_minor bigint, currency char(3))
language sql stable set search_path = ''
as $$
  select l.account_id, l.asset_id, sum(l.quantity), sum(l.amount_minor)::bigint, l.currency
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where l.space_id = p_space_id and l.role = 'position'
    and (p_on is null or t.occurred_on <= p_on)
    and (p_include_pending or t.status = 'settled')
  group by l.account_id, l.asset_id, l.currency
  having sum(l.quantity) <> 0 or sum(l.amount_minor) <> 0;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.create_transaction, public.reverse_transaction, public.delete_transaction,
  public.account_cash_balances, public.position_balances,
  public.category_totals, public.monthly_cashflow, public.seed_default_categories
from public, anon;
grant execute on function
  private.member_role(uuid), private.can_read(uuid), private.can_write(uuid), private.is_owner(uuid),
  private.space_ids_for_roles(public.app_role[]),
  private.readable_space_ids(), private.peer_space_ids(), private.writable_space_ids(), private.owned_space_ids(),
  private.has_verified_mfa(), private.meets_sensitive_aal(), private.is_valid_isin(text)
to authenticated;
grant execute on function
  public.create_transaction, public.reverse_transaction, public.delete_transaction,
  public.account_cash_balances, public.position_balances,
  public.category_totals, public.monthly_cashflow, public.seed_default_categories
to authenticated;

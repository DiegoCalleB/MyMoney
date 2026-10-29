-- =============================================================================
-- Tu parte de una cuenta (ADR-0022): una cuenta compartida (p. ej., conjunta al 50 %) solo cuenta
-- en el patrimonio y en los gastos por la parte de la persona. 10000 pb = toda la cuenta (por
-- defecto). La titularidad legal sigue en `account_holders`; esto es la parte económica propia.
-- =============================================================================
alter table public.accounts
  add column share_bps integer not null default 10000 check (share_bps between 1 and 10000);
comment on column public.accounts.share_bps is 'Parte de la cuenta que es tuya, en puntos básicos (10000 = toda; 5000 = a medias). El patrimonio y los gastos solo cuentan esa parte. [financiero]';
grant update (share_bps) on public.accounts to authenticated;

-- Gasto/ingreso por categoría: cada movimiento pesa la parte de la cuenta de efectivo que lo movió.
create or replace function public.category_totals(
  p_space_id uuid, p_from date, p_to date, p_include_pending boolean default false
) returns table (category_id uuid, flow text, currency char(3), amount_minor bigint, n bigint)
language sql stable set search_path = ''
as $$
  select l.category_id, t.kind, l.currency,
         (case when t.kind = 'expense' then sum(w.part) else -sum(w.part) end)::bigint,
         count(*)
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  cross join lateral (
    select round(l.amount_minor::numeric * coalesce((
      select a.share_bps from public.transaction_legs c
      join public.accounts a on a.id = c.account_id and a.space_id = c.space_id
      where c.transaction_id = l.transaction_id and c.space_id = l.space_id and c.role = 'cash'
      limit 1), 10000) / 10000) as part
  ) w
  where l.space_id = p_space_id and l.role = 'external' and t.kind in ('income', 'expense')
    and t.occurred_on >= p_from and t.occurred_on <= p_to
    and (p_include_pending or t.status = 'settled')
  group by l.category_id, t.kind, l.currency;
$$;

create or replace function public.monthly_cashflow(
  p_space_id uuid, p_from date, p_to date, p_include_pending boolean default false
) returns table (month date, currency char(3), income_minor bigint, expense_minor bigint)
language sql stable set search_path = ''
as $$
  select date_trunc('month', t.occurred_on)::date, l.currency,
         coalesce(-sum(w.part) filter (where t.kind = 'income'), 0)::bigint,
         coalesce(sum(w.part) filter (where t.kind = 'expense'), 0)::bigint
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  cross join lateral (
    select round(l.amount_minor::numeric * coalesce((
      select a.share_bps from public.transaction_legs c
      join public.accounts a on a.id = c.account_id and a.space_id = c.space_id
      where c.transaction_id = l.transaction_id and c.space_id = l.space_id and c.role = 'cash'
      limit 1), 10000) / 10000) as part
  ) w
  where l.space_id = p_space_id and l.role = 'external' and t.kind in ('income', 'expense')
    and t.occurred_on >= p_from and t.occurred_on <= p_to
    and (p_include_pending or t.status = 'settled')
  group by 1, 2
  order by 1, 2;
$$;

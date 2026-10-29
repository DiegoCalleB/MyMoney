-- =============================================================================
-- Calendario de cobros: dividendos e intereses por cuenta y fecha (docs/plan/16-integraciones.md).
-- Aditiva: función de lectura (security invoker: RLS aplica al usuario), como account_external_flows.
-- =============================================================================
create function public.account_income_events(p_space_id uuid, p_on date default null)
returns table (account_id uuid, occurred_on date, kind text, currency char(3), amount_minor bigint)
language sql stable set search_path = ''
as $$
  select l.account_id, t.occurred_on, t.kind, l.currency, sum(l.amount_minor)::bigint
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where l.space_id = p_space_id and l.role = 'cash'
    and t.kind in ('dividend', 'interest') and t.status = 'settled'
    and (p_on is null or t.occurred_on <= p_on)
  group by l.account_id, t.occurred_on, t.kind, l.currency
  order by t.occurred_on, l.account_id, t.kind;
$$;
comment on function public.account_income_events is 'Dividendos e intereses liquidados por cuenta, fecha y tipo, hasta p_on (importe de la pata de efectivo; una corrección puede ser negativa). [financiero]';
revoke execute on function public.account_income_events(uuid, date) from public, anon;
grant execute on function public.account_income_events(uuid, date) to authenticated;

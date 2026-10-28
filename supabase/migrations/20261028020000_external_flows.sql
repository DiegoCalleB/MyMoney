-- Aportaciones y retiradas externas por cuenta (ADR-0021): base de la rentabilidad (aportado
-- frente a ganado, XIRR). Solo movimientos liquidados de tipo aportación o retirada, con el
-- importe de la pata de efectivo (positivo entra en la cuenta, negativo sale). Aditiva.
create function public.account_external_flows(p_space_id uuid, p_on date default null)
returns table (account_id uuid, occurred_on date, currency char(3), amount_minor bigint)
language sql stable set search_path = ''
as $$
  select l.account_id, t.occurred_on, l.currency, sum(l.amount_minor)::bigint
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where l.space_id = p_space_id and l.role = 'cash'
    and t.kind in ('contribution', 'withdrawal') and t.status = 'settled'
    and (p_on is null or t.occurred_on <= p_on)
  group by l.account_id, t.occurred_on, l.currency
  order by l.account_id, t.occurred_on;
$$;
comment on function public.account_external_flows is 'Aportaciones (+) y retiradas (−) liquidadas por cuenta y fecha, hasta p_on. [financiero]';
revoke execute on function public.account_external_flows(uuid, date) from public, anon;
grant execute on function public.account_external_flows(uuid, date) to authenticated;

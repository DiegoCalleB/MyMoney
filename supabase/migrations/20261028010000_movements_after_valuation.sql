-- Movimientos de efectivo posteriores a la última valoración de cada cuenta (ADR-0021).
-- El patrimonio parte de la valoración y le suma lo apuntado después; así un gasto o un ingreso
-- registrado a mano cambia el total sin tener que volver a valorar la cuenta. Aditiva.
create function public.account_movements_after_valuation(p_space_id uuid, p_on date default null)
returns table (account_id uuid, currency char(3), delta_minor bigint, last_on date)
language sql stable set search_path = ''
as $$
  with latest as (
    select distinct on (v.account_id) v.account_id, v.as_of
    from public.valuations v
    where v.space_id = p_space_id and v.asset_id is null
      and (p_on is null or v.as_of <= p_on)
    order by v.account_id, v.as_of desc
  )
  select l.account_id, l.currency, sum(l.amount_minor)::bigint, max(t.occurred_on)
  from latest
  join public.transaction_legs l on l.account_id = latest.account_id and l.space_id = p_space_id and l.role = 'cash'
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where t.status = 'settled'
    and t.occurred_on > latest.as_of
    and (p_on is null or t.occurred_on <= p_on)
  group by l.account_id, l.currency;
$$;
comment on function public.account_movements_after_valuation is 'Suma de movimientos liquidados de efectivo posteriores a la última valoración de la cuenta (hasta p_on) y fecha del último. [financiero]';
revoke execute on function public.account_movements_after_valuation(uuid, date) from public, anon;
grant execute on function public.account_movements_after_valuation(uuid, date) to authenticated;

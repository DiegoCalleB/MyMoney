-- Patas del libro para calcular rentabilidades (ADR-0022). Devuelve, de los movimientos
-- liquidados que tocan las cuentas pedidas (o todas), todas sus patas con la fecha y el tipo del
-- movimiento: `finance-core` decide qué es aportación, retirada, rendimiento o coste. Aditiva.
create function public.return_legs(
  p_space_id uuid, p_account_ids uuid[] default null, p_to date default null
) returns table (
  leg_id uuid, transaction_id uuid, occurred_on date, kind text, role text,
  account_id uuid, currency char(3), amount_minor bigint
)
language sql stable set search_path = ''
as $$
  with touched as (
    select distinct l.transaction_id
    from public.transaction_legs l
    join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
    where l.space_id = p_space_id
      and l.role in ('cash', 'position')
      and (p_account_ids is null or l.account_id = any (p_account_ids))
      and t.status = 'settled'
      and (p_to is null or t.occurred_on <= p_to)
  )
  select l.id, l.transaction_id, t.occurred_on, t.kind, l.role, l.account_id, l.currency, l.amount_minor
  from touched
  join public.transactions t on t.id = touched.transaction_id and t.space_id = p_space_id
  join public.transaction_legs l on l.transaction_id = touched.transaction_id and l.space_id = p_space_id
  order by t.occurred_on, l.transaction_id, l.id;
$$;
comment on function public.return_legs is 'Todas las patas de los movimientos liquidados que tocan las cuentas indicadas (o cualquiera si es nulo) hasta p_to, ordenadas por fecha. Base de los flujos externos de la rentabilidad. [financiero]';
revoke execute on function public.return_legs(uuid, uuid[], date) from public, anon;
grant execute on function public.return_legs(uuid, uuid[], date) to authenticated;

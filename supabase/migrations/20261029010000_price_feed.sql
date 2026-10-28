-- =============================================================================
-- Precios automáticos de criptoactivos (docs/plan/16-integraciones.md, paso 6).
-- Dos funciones solo para el servidor (service_role): qué criptoactivos hay que valorar y
-- guardar sus precios en ref.prices. `ref` no se expone por la API, así que se entra por RPC.
-- Aditiva: no cambia tablas ni funciones existentes.
-- =============================================================================

-- Tickers distintos de los criptoactivos de todos los espacios. security definer: debe leer
-- assets de todos los inquilinos, pero solo devuelve símbolos públicos (BTC, ETH…), sin espacio,
-- importes ni nombres. Solo ejecutable por service_role.
create function public.crypto_tickers() returns table (ticker text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede listar los criptoactivos' using errcode = 'insufficient_privilege';
  end if;
  return query
    select distinct upper(a.ticker)
    from public.assets a
    where a.kind = 'crypto' and a.ticker is not null and upper(a.ticker) ~ '^[A-Z0-9]{2,12}$'
    order by 1;
end;
$$;
comment on function public.crypto_tickers is 'Símbolos distintos de los criptoactivos de todos los espacios (sin datos de ningún espacio). Solo service_role.';

-- Guarda precios de mercado (datos públicos y compartidos). p_rows: [{ instrument, as_of, price,
-- currency, source }]; price llega como cadena decimal. Una fila por instrumento y día: la última
-- escritura del día gana. security definer: escribe en ref.prices, sin permisos para usuarios.
create function public.upsert_ref_prices(p_rows jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede escribir precios' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows debe ser un array JSON' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_rows) > 500 then
    raise exception 'Como máximo 500 precios por llamada' using errcode = 'invalid_parameter_value';
  end if;
  insert into ref.prices (instrument, as_of, price, currency, source)
  select x.instrument, x.as_of, x.price, x.currency, x.source
  from jsonb_to_recordset(p_rows) as x(instrument text, as_of date, price numeric, currency text, source text)
  on conflict (instrument, as_of) do update
    set price = excluded.price, currency = excluded.currency, source = excluded.source;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.upsert_ref_prices is 'Inserta o actualiza precios de ref.prices (uno por instrumento y día). Solo service_role; las restricciones de la tabla validan instrumento, precio positivo, moneda y fuente.';

revoke execute on function public.crypto_tickers(), public.upsert_ref_prices(jsonb) from public, anon, authenticated;
grant execute on function public.crypto_tickers(), public.upsert_ref_prices(jsonb) to service_role;

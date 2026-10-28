-- Carga del IPC en ref.inflation_index (ADR-0023). La ejecuta solo la función de Supabase
-- `sync-inflation` con la clave de servicio; ninguna otra función ni usuario puede escribir en
-- `ref`. Idempotente: repetir la carga con los mismos datos no cambia nada y devuelve 0.
-- Aditiva. Es `security invoker`: se apoya en los permisos de service_role sobre la tabla.
create function public.upsert_inflation_index(p_country char(2), p_series_code text, p_rows jsonb)
returns integer
language plpgsql set search_path = ''
as $$
declare
  v_changed integer;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'p_rows debe ser una lista de 1 a 2000 observaciones' using errcode = 'invalid_parameter_value';
  end if;
  insert into ref.inflation_index as t (country, period, index_value, series_code, published_on)
  select p_country, (r ->> 'period')::date, (r ->> 'index')::numeric, p_series_code, current_date
  from jsonb_array_elements(p_rows) as r
  on conflict (country, period) do update
    set index_value = excluded.index_value,
        series_code = excluded.series_code,
        published_on = excluded.published_on
    where t.index_value is distinct from excluded.index_value
       or t.series_code is distinct from excluded.series_code;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;
comment on function public.upsert_inflation_index is 'Inserta o actualiza observaciones mensuales del IPC ({"period":"2026-08-01","index":"119.942"}). Devuelve cuántas filas cambiaron. Solo service_role. published_on es la fecha de la carga.';
revoke execute on function public.upsert_inflation_index(char, text, jsonb) from public, anon, authenticated;
grant execute on function public.upsert_inflation_index(char, text, jsonb) to service_role;

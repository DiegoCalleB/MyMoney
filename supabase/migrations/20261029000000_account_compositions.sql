-- Reparto por clase de activo de una cuenta (ADR-0024). Para el riesgo y los escenarios de caída:
-- un broker o un fondo mixto no tiene una sola clase. Es el ajuste manual sobre el valor por
-- defecto que sale del tipo de cuenta. Aditiva. Sin histórico: el reparto vigente de la cuenta.
create table public.account_compositions (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  account_id uuid not null,
  asset_class text not null check (asset_class in (
    'equity', 'fixed_income', 'cash', 'real_estate', 'crypto', 'commodity')),
  weight_bps integer not null check (weight_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, asset_class),
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade
);
comment on table public.account_compositions is 'Cómo se reparte una cuenta entre clases de activo (puntos básicos). La suma por cuenta es ≤ 10000 pb; lo que falte queda sin clasificar. Sustituye al valor por defecto del tipo de cuenta. [financiero]';
comment on column public.account_compositions.weight_bps is 'Parte de la cuenta en esta clase, en puntos básicos (10000 = 100 %).';
create index account_compositions_account_idx on public.account_compositions (space_id, account_id);

create function private.validate_account_composition(p_space uuid, p_account uuid)
returns void
language plpgsql security definer set search_path = ''
-- security definer: suma todas las filas de la cuenta aunque el usuario no las vea; solo valida y no devuelve datos.
as $$
declare
  v_total bigint;
begin
  select coalesce(sum(c.weight_bps), 0) into v_total
  from public.account_compositions c
  where c.space_id = p_space and c.account_id = p_account;
  if v_total > 10000 then
    raise exception 'El reparto de la cuenta supera el 100 %% (% pb)', v_total using errcode = 'check_violation';
  end if;
end;
$$;

create function private.trg_account_compositions() returns trigger
language plpgsql security definer set search_path = ''
-- security definer: delega en validate_account_composition; no expone datos.
as $$
begin
  if tg_op <> 'INSERT' then
    perform private.validate_account_composition(old.space_id, old.account_id);
  end if;
  if tg_op <> 'DELETE' then
    perform private.validate_account_composition(new.space_id, new.account_id);
  end if;
  return null;
end;
$$;
create constraint trigger account_compositions_validate
  after insert or update or delete on public.account_compositions
  deferrable initially deferred for each row execute function private.trg_account_compositions();

select private.secure_space_table('account_compositions');

-- Sustituye el reparto de una cuenta por el indicado ({"equity": 6000, "fixed_income": 3000}) en
-- una sola operación. Un objeto vacío lo borra y la cuenta vuelve a la clase por defecto de su
-- tipo. security invoker: la RLS decide quién puede escribir; la suma ≤ 10000 la impone el trigger.
create function public.set_account_composition(p_space_id uuid, p_account_id uuid, p_weights jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(p_weights) is distinct from 'object' then
    raise exception 'p_weights debe ser un objeto {clase: puntos básicos}' using errcode = 'invalid_parameter_value';
  end if;
  delete from public.account_compositions where space_id = p_space_id and account_id = p_account_id;
  insert into public.account_compositions (space_id, account_id, asset_class, weight_bps)
  select p_space_id, p_account_id, w.key, (w.value)::integer
  from jsonb_each_text(p_weights) as w
  where (w.value)::integer > 0;
end;
$$;
comment on function public.set_account_composition is 'Sustituye el reparto por clase de activo de una cuenta. Las clases con peso 0 no se guardan. [financiero]';
revoke execute on function public.set_account_composition(uuid, uuid, jsonb) from public, anon;
grant execute on function public.set_account_composition(uuid, uuid, jsonb) to authenticated;

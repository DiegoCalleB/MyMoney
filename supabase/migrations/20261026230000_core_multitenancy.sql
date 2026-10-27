-- =============================================================================
-- 1/5 · Multitenencia, auditoría, referencia y derechos del usuario.
-- ADR-0004 (RLS), ADR-0009 (auditoría), ADR-0011 (flags), docs/plan/15-revision-bd.md.
--
-- Principios:
--  · RLS activada y FORZADA en toda tabla; anon sin ningún permiso.
--  · Las políticas usan funciones que devuelven arrays de espacios, envueltas en
--    (select ...): Postgres las evalúa UNA vez por consulta (InitPlan) y usa el índice
--    por space_id, en lugar de llamar a una función por fila.
--  · Funciones con search_path vacío y nombres cualificados.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Esquemas y permisos por defecto
-- ---------------------------------------------------------------------------
create schema if not exists private;
create schema if not exists ref;
create schema if not exists audit;

comment on schema private is 'Funciones auxiliares de seguridad y tablas internas. No expuesto en la API.';
comment on schema ref is 'Datos de referencia compartidos (monedas, tipos de cambio, IPC, flags). No expuesto: se lee mediante vistas de public.';
comment on schema audit is 'Registro de auditoría inmutable. No expuesto en la API.';

revoke all on schema private, ref, audit from public, anon;
grant usage on schema private, ref to authenticated;
grant usage on schema ref to service_role;

-- Supabase concede por defecto todo a anon/authenticated sobre lo que se crea en public.
-- Lo retiramos para que cada objeto nuevo nazca denegado y los permisos sean explícitos.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
-- Por defecto Postgres da EXECUTE a PUBLIC en toda función nueva: lo quitamos globalmente
-- (para el rol que ejecuta las migraciones). Los permisos se conceden función a función.
alter default privileges revoke execute on functions from public;

create type public.app_role as enum ('owner', 'editor', 'viewer', 'advisor');
comment on type public.app_role is 'Rol en un espacio. advisor = asesor invitado de solo lectura con caducidad obligatoria.';

-- ---------------------------------------------------------------------------
-- Configuración interna
-- ---------------------------------------------------------------------------
create table private.app_settings (
  key text primary key,
  value bytea not null
);
comment on table private.app_settings is 'Secretos internos de la base de datos (pimienta de seudónimos de auditoría). Solo accesible por funciones security definer.';
alter table private.app_settings enable row level security;
alter table private.app_settings force row level security;
revoke all on private.app_settings from public, anon, authenticated;

insert into private.app_settings (key, value) values ('audit_pepper', extensions.gen_random_bytes(32));

-- ---------------------------------------------------------------------------
-- Referencia
-- ---------------------------------------------------------------------------
create table ref.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  minor_units smallint not null check (minor_units in (0, 2, 3))
);
comment on table ref.currencies is 'Monedas ISO 4217 soportadas. Debe coincidir con MINOR_UNITS de finance-core.';

insert into ref.currencies (code, minor_units) values
  ('EUR', 2), ('USD', 2), ('GBP', 2), ('CHF', 2), ('SEK', 2), ('NOK', 2), ('DKK', 2),
  ('PLN', 2), ('CZK', 2), ('HUF', 2), ('CAD', 2), ('AUD', 2), ('MXN', 2), ('BRL', 2),
  ('CLP', 0), ('COP', 2), ('ARS', 2), ('JPY', 0), ('KRW', 0), ('KWD', 3);

create table ref.feature_flags (
  key text not null check (key ~ '^[a-z0-9_.]+$'),
  scope_type text not null check (scope_type in ('global', 'country', 'space')),
  scope_value text not null default '',
  enabled boolean not null,
  note text,
  primary key (key, scope_type, scope_value),
  check ((scope_type = 'global') = (scope_value = '')),
  check (scope_type <> 'space' or scope_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
comment on table ref.feature_flags is 'Feature flags. Precedencia: space > country > global (ADR-0011).';

insert into ref.feature_flags (key, scope_type, scope_value, enabled, note) values
  ('reco.level1', 'global', '', true, 'Contenido educativo y genérico'),
  ('reco.level2', 'global', '', false, 'Avisos por reglas: solo en países con plantillas revisadas'),
  ('reco.level2', 'country', 'ES', true, 'Plantillas de España'),
  ('reco.level3', 'global', '', false, 'Productos concretos: DESACTIVADO hasta validación legal'),
  ('ai.explanations', 'global', '', false, 'Requiere EIPD y consentimiento');

-- ---------------------------------------------------------------------------
-- Identidad y multitenencia
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  locale text not null default 'es-ES' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil del usuario. [pii]';
comment on column public.profiles.display_name is 'Nombre visible o alias. [pii]';

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'household' check (kind in ('personal', 'household', 'client')),
  country_code char(2) not null default 'ES' check (country_code ~ '^[A-Z]{2}$'),
  base_currency char(3) not null default 'EUR' references ref.currencies (code),
  timezone text not null default 'Europe/Madrid',
  plan text not null default 'personal',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.spaces is 'Espacio (hogar, persona o cliente): unidad de aislamiento de datos.';
comment on column public.spaces.name is 'Nombre libre (p. ej., el apellido de la familia). [pii]';
create index spaces_created_by_idx on public.spaces (created_by);
create index spaces_base_currency_idx on public.spaces (base_currency);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  expires_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (space_id, user_id),
  constraint advisor_requires_expiry check (role <> 'advisor' or expires_at is not null)
);
comment on table public.space_members is 'Membresía de un usuario en un espacio con su rol.';
-- Cubre la búsqueda por usuario que hacen las funciones de autorización.
create index space_members_user_idx on public.space_members (user_id) include (space_id, role, expires_at);
create index space_members_invited_by_idx on public.space_members (invited_by);

create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  email_normalized text check (email_normalized is null or email_normalized = lower(email_normalized)),
  role public.app_role not null,
  advisor_days smallint check (advisor_days between 1 and 30),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint advisor_invite_requires_days check (role <> 'advisor' or advisor_days is not null)
);
comment on table public.space_invitations is 'Invitaciones de un solo uso. Solo se guarda el hash del token.';
comment on column public.space_invitations.email_normalized is 'Correo invitado; se borra al aceptar, revocar o caducar. [pii]';
create index space_invitations_space_idx on public.space_invitations (space_id);
create index space_invitations_accepted_by_idx on public.space_invitations (accepted_by);
create index space_invitations_created_by_idx on public.space_invitations (created_by);

-- ---------------------------------------------------------------------------
-- Funciones de autorización
-- ---------------------------------------------------------------------------
-- Rol vigente del usuario actual en un espacio (una sola fila): para RPC y comprobaciones puntuales.
create function private.member_role(p_space_id uuid)
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.space_members m
  where m.space_id = p_space_id
    and m.user_id = (select auth.uid())
    and (m.expires_at is null or m.expires_at > now());
$$;
comment on function private.member_role is 'Rol vigente del usuario actual en el espacio, o null. security definer: lee space_members saltando su RLS para no recursar.';

create function private.can_read(p_space_id uuid) returns boolean
language sql stable set search_path = ''
as $$ select private.member_role(p_space_id) is not null; $$;

create function private.can_write(p_space_id uuid) returns boolean
language sql stable set search_path = ''
as $$ select coalesce(private.member_role(p_space_id) in ('owner', 'editor'), false); $$;

create function private.is_owner(p_space_id uuid) returns boolean
language sql stable set search_path = ''
as $$ select coalesce(private.member_role(p_space_id) = 'owner', false); $$;

-- Arrays de espacios para las políticas RLS. Se usan siempre como (select private.xxx()).
create function private.space_ids_for_roles(p_roles public.app_role[])
returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.space_id), '{}'::uuid[])
  from public.space_members m
  where m.user_id = (select auth.uid())
    and m.role = any (p_roles)
    and (m.expires_at is null or m.expires_at > now());
$$;
comment on function private.space_ids_for_roles is 'Espacios donde el usuario actual tiene alguno de los roles dados y acceso vigente. security definer por la misma razón que member_role.';

create function private.readable_space_ids() returns uuid[]
language sql stable set search_path = ''
as $$ select private.space_ids_for_roles(array['owner', 'editor', 'viewer', 'advisor']::public.app_role[]); $$;

create function private.peer_space_ids() returns uuid[]
language sql stable set search_path = ''
as $$ select private.space_ids_for_roles(array['owner', 'editor', 'viewer']::public.app_role[]); $$;
comment on function private.peer_space_ids is 'Como readable, sin asesores: para datos que el asesor invitado no debe ver (miembros, importaciones).';

create function private.writable_space_ids() returns uuid[]
language sql stable set search_path = ''
as $$ select private.space_ids_for_roles(array['owner', 'editor']::public.app_role[]); $$;

create function private.owned_space_ids() returns uuid[]
language sql stable set search_path = ''
as $$ select private.space_ids_for_roles(array['owner']::public.app_role[]); $$;

create function private.has_verified_mfa() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = (select auth.uid()) and f.status = 'verified'
  );
$$;

-- Acciones sensibles: si el usuario tiene MFA verificado, exigimos sesión AAL2.
create function private.meets_sensitive_aal() returns boolean
language sql stable set search_path = ''
as $$
  select not private.has_verified_mfa()
      or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;

-- ISIN: formato + dígito de control (Luhn sobre las letras convertidas a números).
create function private.is_valid_isin(p_isin text) returns boolean
language plpgsql immutable strict set search_path = ''
as $$
declare
  v_digits text := '';
  v_ch text;
  v_sum integer := 0;
  v_double boolean := false;
  v_d integer;
  i integer;
begin
  if p_isin !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' then
    return false;
  end if;
  for i in 1..11 loop
    v_ch := substr(p_isin, i, 1);
    v_digits := v_digits || case when v_ch ~ '[0-9]' then v_ch else (ascii(v_ch) - 55)::text end;
  end loop;
  v_digits := v_digits || substr(p_isin, 12, 1);
  for i in reverse char_length(v_digits)..1 loop
    v_d := substr(v_digits, i, 1)::integer;
    if v_double then
      v_d := v_d * 2;
      if v_d > 9 then v_d := v_d - 9; end if;
    end if;
    v_sum := v_sum + v_d;
    v_double := not v_double;
  end loop;
  return v_sum % 10 = 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auditoría inmutable, encadenada por espacio (ADR-0009)
-- ---------------------------------------------------------------------------
create table audit.events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_hash bytea,
  space_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  prev_hash bytea,
  hash bytea not null
);
comment on table audit.events is 'Eventos de seguridad. Sin PII ni importes. Solo inserción. Una cadena de hashes por espacio (space_id nulo = cadena global).';
create index audit_events_chain_idx on audit.events (space_id, id desc);
alter table audit.events enable row level security;
alter table audit.events force row level security;
revoke all on audit.events from public, anon, authenticated;

create function private.pseudonymize(p_value text) returns bytea
language sql stable security definer set search_path = ''
as $$
  select extensions.hmac(
    convert_to(p_value, 'UTF8'),
    (select s.value from private.app_settings s where s.key = 'audit_pepper'),
    'sha256'
  );
$$;

-- Contenido canónico de un evento: lo que se encadena. Misma función al escribir y al verificar.
create function audit.canonical(
  p_at timestamptz, p_actor bytea, p_space uuid, p_action text, p_entity text, p_entity_id text, p_metadata jsonb
) returns bytea
language sql immutable set search_path = ''
as $$
  select convert_to(jsonb_build_object(
    'at', extract(epoch from p_at), 'actor', encode(p_actor, 'hex'), 'space', p_space,
    'action', p_action, 'entity', p_entity, 'entity_id', p_entity_id, 'metadata', p_metadata
  )::text, 'UTF8');
$$;

create function audit.log_event(
  p_action text, p_entity text, p_entity_id text, p_space_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_prev bytea;
  v_actor bytea;
  v_at timestamptz := clock_timestamp();
  v_meta jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  -- Serializa solo las escrituras de la misma cadena (espacio), no las de todos los espacios.
  perform pg_advisory_xact_lock(hashtext(coalesce(p_space_id::text, 'global')));
  select e.hash into v_prev
  from audit.events e
  where e.space_id is not distinct from p_space_id
  order by e.id desc
  limit 1;
  v_actor := case when (select auth.uid()) is null then null
                  else private.pseudonymize((select auth.uid())::text) end;
  insert into audit.events (occurred_at, actor_hash, space_id, action, entity, entity_id, metadata, prev_hash, hash)
  values (
    v_at, v_actor, p_space_id, p_action, p_entity, p_entity_id, v_meta, v_prev,
    extensions.digest(
      coalesce(v_prev, ''::bytea) || audit.canonical(v_at, v_actor, p_space_id, p_action, p_entity, p_entity_id, v_meta),
      'sha256')
  );
end;
$$;
comment on function audit.log_event is 'Única vía de escritura en audit.events.';

-- Primer evento cuya cadena no cuadra en un espacio (null = íntegra). Tolera que el inicio
-- de la cadena se haya purgado por retención: el primer evento fija el ancla.
create function audit.verify_chain(p_space_id uuid default null) returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  v_prev bytea;
  v_first boolean := true;
begin
  for r in select * from audit.events e where e.space_id is not distinct from p_space_id order by e.id loop
    if v_first then
      v_prev := r.prev_hash;
      v_first := false;
    end if;
    if r.prev_hash is distinct from v_prev
       or r.hash <> extensions.digest(
            coalesce(v_prev, ''::bytea)
            || audit.canonical(r.occurred_at, r.actor_hash, r.space_id, r.action, r.entity, r.entity_id, r.metadata),
            'sha256') then
      return r.id;
    end if;
    v_prev := r.hash;
  end loop;
  return null;
end;
$$;

-- Verifica todas las cadenas; devuelve (espacio, primer evento roto) solo de las rotas.
create function audit.verify_all() returns table (space_id uuid, first_bad_id bigint)
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  v_bad bigint;
begin
  for r in select distinct e.space_id as sid from audit.events e loop
    v_bad := audit.verify_chain(r.sid);
    if v_bad is not null then
      space_id := r.sid;
      first_bad_id := v_bad;
      return next;
    end if;
  end loop;
end;
$$;

-- Retención: único camino para borrar eventos (los disparadores lo bloquean en cualquier otro caso).
create function audit.purge_older_than(p_age interval default interval '2 years') returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_count bigint;
begin
  perform set_config('audit.allow_purge', 'on', true);
  delete from audit.events e where e.occurred_at < now() - p_age;
  get diagnostics v_count = row_count;
  perform set_config('audit.allow_purge', 'off', true);
  return v_count;
end;
$$;

create function audit.forbid_mutation() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('audit.allow_purge', true), 'off') = 'on' then
    return old;
  end if;
  raise exception 'audit.events es de solo inserción' using errcode = 'insufficient_privilege';
end;
$$;
create trigger audit_events_immutable before update or delete on audit.events
  for each row execute function audit.forbid_mutation();
create trigger audit_events_no_truncate before truncate on audit.events
  for each statement execute function audit.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Disparadores genéricos
-- ---------------------------------------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger spaces_touch before update on public.spaces
  for each row execute function private.touch_updated_at();
create trigger space_members_touch before update on public.space_members
  for each row execute function private.touch_updated_at();

-- Perfil automático al registrarse (create_space y accept_invitation lo garantizan además).
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Un espacio nunca se queda sin propietario mientras tenga miembros; si se queda vacío, se borra.
create function private.enforce_space_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.spaces s where s.id = old.space_id) then
    return null; -- el espacio se está borrando (cascada)
  end if;
  if exists (select 1 from public.space_members m where m.space_id = old.space_id and m.role = 'owner') then
    return null;
  end if;
  if exists (select 1 from public.space_members m where m.space_id = old.space_id) then
    raise exception 'Un espacio debe tener al menos un propietario' using errcode = 'check_violation';
  end if;
  delete from public.spaces s where s.id = old.space_id;
  return null;
end;
$$;
create trigger space_members_keep_owner after update or delete on public.space_members
  for each row execute function private.enforce_space_owner();

-- Auditoría de membresías, espacios e invitaciones.
create function private.audit_space_members() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.log_event('member.added', 'space_member', encode(private.pseudonymize(new.user_id::text), 'hex'),
      new.space_id, jsonb_build_object('role', new.role, 'expires_at', new.expires_at));
  elsif tg_op = 'UPDATE' then
    perform audit.log_event('member.role_changed', 'space_member', encode(private.pseudonymize(new.user_id::text), 'hex'),
      new.space_id, jsonb_build_object('from', old.role, 'to', new.role, 'expires_at', new.expires_at));
  else
    perform audit.log_event('member.removed', 'space_member', encode(private.pseudonymize(old.user_id::text), 'hex'),
      old.space_id, jsonb_build_object('role', old.role));
  end if;
  return null;
end;
$$;
create trigger space_members_audit after insert or update or delete on public.space_members
  for each row execute function private.audit_space_members();

create function private.audit_spaces() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.log_event('space.created', 'space', new.id::text, new.id, '{}'::jsonb);
  else
    perform audit.log_event('space.deleted', 'space', old.id::text, old.id, '{}'::jsonb);
  end if;
  return null;
end;
$$;
create trigger spaces_audit after insert or delete on public.spaces
  for each row execute function private.audit_spaces();

create function private.audit_invitations() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.log_event('invitation.created', 'invitation', new.id::text, new.space_id,
      jsonb_build_object('role', new.role));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform audit.log_event('invitation.revoked', 'invitation', new.id::text, new.space_id, '{}'::jsonb);
  elsif new.accepted_at is not null and old.accepted_at is null then
    perform audit.log_event('invitation.accepted', 'invitation', new.id::text, new.space_id, '{}'::jsonb);
  end if;
  return null;
end;
$$;
create trigger space_invitations_audit after insert or update on public.space_invitations
  for each row execute function private.audit_invitations();

-- ---------------------------------------------------------------------------
-- RLS y permisos
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.spaces enable row level security;
alter table public.spaces force row level security;
alter table public.space_members enable row level security;
alter table public.space_members force row level security;
alter table public.space_invitations enable row level security;
alter table public.space_invitations force row level security;
alter table ref.currencies enable row level security;
alter table ref.currencies force row level security;
alter table ref.feature_flags enable row level security;
alter table ref.feature_flags force row level security;

-- ref: lectura para usuarios; escritura solo por service_role/postgres (saltan RLS).
create policy currencies_read on ref.currencies for select to authenticated using (true);
-- Las flags de ámbito "space" solo las ve quien pertenece a ese espacio (no se filtran ids ajenos).
create policy feature_flags_read on ref.feature_flags for select to authenticated
using (scope_type <> 'space' or scope_value = any ((select private.readable_space_ids())::text[]));

-- profiles: el propio perfil y el de quien comparte espacio conmigo (sin contar asesores).
create policy profiles_select on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or user_id in (
    select m.user_id from public.space_members m
    where m.space_id = any ((select private.peer_space_ids())::uuid[])
  )
);
create policy profiles_update on public.profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- spaces: lectura para miembros; cambios y borrado solo propietarios con AAL suficiente.
-- La creación es solo mediante la RPC create_space.
create policy spaces_select on public.spaces for select to authenticated
using (id = any ((select private.readable_space_ids())::uuid[]));
create policy spaces_update on public.spaces for update to authenticated
using (id = any ((select private.owned_space_ids())::uuid[]) and (select private.meets_sensitive_aal()))
with check (id = any ((select private.owned_space_ids())::uuid[]));
create policy spaces_delete on public.spaces for delete to authenticated
using (id = any ((select private.owned_space_ids())::uuid[]) and (select private.meets_sensitive_aal()));

-- space_members: el asesor solo ve su propia fila.
create policy space_members_select on public.space_members for select to authenticated
using (user_id = (select auth.uid()) or space_id = any ((select private.peer_space_ids())::uuid[]));
create policy space_members_update on public.space_members for update to authenticated
using (space_id = any ((select private.owned_space_ids())::uuid[]) and (select private.meets_sensitive_aal()))
with check (space_id = any ((select private.owned_space_ids())::uuid[]));
create policy space_members_delete on public.space_members for delete to authenticated
using (
  user_id = (select auth.uid())
  or (space_id = any ((select private.owned_space_ids())::uuid[]) and (select private.meets_sensitive_aal()))
);

-- space_invitations: solo propietarios; la creación y la aceptación van por RPC.
create policy space_invitations_select on public.space_invitations for select to authenticated
using (space_id = any ((select private.owned_space_ids())::uuid[]));
create policy space_invitations_revoke on public.space_invitations for update to authenticated
using (space_id = any ((select private.owned_space_ids())::uuid[]) and accepted_at is null)
with check (space_id = any ((select private.owned_space_ids())::uuid[]));

-- Permisos: lo que no se concede no se puede tocar aunque la política lo permitiera.
revoke all on public.profiles, public.spaces, public.space_members, public.space_invitations
  from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, locale, timezone) on public.profiles to authenticated;
grant select, delete on public.spaces to authenticated;
grant update (name, kind, country_code, base_currency, timezone) on public.spaces to authenticated;
grant select, delete on public.space_members to authenticated;
grant update (role, expires_at) on public.space_members to authenticated;
grant select (id, space_id, role, advisor_days, expires_at, accepted_at, revoked_at, created_by, created_at)
  on public.space_invitations to authenticated;
grant update (revoked_at) on public.space_invitations to authenticated;

revoke all on ref.currencies, ref.feature_flags from public, anon, authenticated;
grant select on ref.currencies, ref.feature_flags to authenticated;

-- ref no está expuesto en la API: se lee mediante vistas de public con los permisos del invocador.
create view public.currencies with (security_invoker = true) as
  select code, minor_units from ref.currencies;
comment on view public.currencies is 'Monedas soportadas (lectura).';
revoke all on public.currencies from public, anon, authenticated;
grant select on public.currencies to authenticated;

-- ---------------------------------------------------------------------------
-- RPC públicas. security definer justificado: crean filas que el usuario aún no puede
-- ver/escribir por RLS; todas comprueban permisos de forma explícita.
-- ---------------------------------------------------------------------------
create function public.create_space(
  p_name text,
  p_kind text default 'household',
  p_country_code char(2) default 'ES',
  p_base_currency char(3) default 'EUR',
  p_timezone text default 'Europe/Madrid'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_space uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = p_timezone) then
    raise exception 'Zona horaria no válida' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from public.space_members m where m.user_id = v_uid and m.role = 'owner') >= 20 then
    raise exception 'Límite de espacios alcanzado' using errcode = 'program_limit_exceeded';
  end if;
  insert into public.profiles (user_id) values (v_uid) on conflict do nothing;
  insert into public.spaces (name, kind, country_code, base_currency, timezone, created_by)
  values (p_name, p_kind, p_country_code, p_base_currency, p_timezone, v_uid)
  returning id into v_space;
  insert into public.space_members (space_id, user_id, role, invited_by)
  values (v_space, v_uid, 'owner', v_uid);
  return v_space;
end;
$$;
comment on function public.create_space is 'Crea un espacio y hace propietario al usuario actual.';

-- Devuelve el token en claro UNA sola vez; en la base de datos solo queda su hash.
create function public.create_invitation(
  p_space_id uuid, p_email text, p_role public.app_role, p_advisor_days smallint default null
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token bytea := extensions.gen_random_bytes(32);
  v_email text := lower(trim(p_email));
begin
  if not private.is_owner(p_space_id) or not private.meets_sensitive_aal() then
    raise exception 'Solo un propietario puede invitar' using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Correo no válido' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from public.space_invitations i
      where i.space_id = p_space_id and i.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Demasiadas invitaciones hoy' using errcode = 'program_limit_exceeded';
  end if;
  insert into public.space_invitations (space_id, email_normalized, role, advisor_days, token_hash, expires_at, created_by)
  values (p_space_id, v_email, p_role,
          case when p_role = 'advisor' then coalesce(p_advisor_days, 30::smallint) end,
          extensions.digest(v_token, 'sha256'), now() + interval '72 hours', (select auth.uid()));
  return translate(encode(v_token, 'base64'), '+/=', '-_');
end;
$$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower((select auth.jwt()) ->> 'email');
  v_inv public.space_invitations;
  v_hash bytea;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  begin
    v_hash := extensions.digest(
      decode(translate(p_token, '-_', '+/') || repeat('=', (4 - char_length(p_token) % 4) % 4), 'base64'),
      'sha256');
  exception when others then
    v_hash := null; -- token mal formado: mismo error genérico que uno inexistente
  end;
  select * into v_inv from public.space_invitations i where i.token_hash = v_hash for update;
  -- Mismo error para todos los fallos: no revelamos si el token existe.
  if v_inv.id is null or v_inv.accepted_at is not null or v_inv.revoked_at is not null
     or v_inv.expires_at <= now() or v_inv.email_normalized is distinct from v_email then
    raise exception 'Invitación no válida o caducada' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from public.space_members m where m.space_id = v_inv.space_id and m.user_id = v_uid) then
    raise exception 'Ya eres miembro de este espacio' using errcode = 'unique_violation';
  end if;
  insert into public.profiles (user_id) values (v_uid) on conflict do nothing;
  insert into public.space_members (space_id, user_id, role, expires_at, invited_by)
  values (v_inv.space_id, v_uid, v_inv.role,
          case when v_inv.role = 'advisor' then now() + make_interval(days => v_inv.advisor_days) end,
          v_inv.created_by);
  update public.space_invitations
     set accepted_at = now(), accepted_by = v_uid, email_normalized = null
   where id = v_inv.id;
  return v_inv.space_id;
end;
$$;

-- Flag efectiva para un espacio (space > country > global). Solo para miembros.
create function public.feature_enabled(p_key text, p_space_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when not private.can_read(p_space_id) then false else coalesce(
    (select f.enabled from ref.feature_flags f
      where f.key = p_key and f.scope_type = 'space' and f.scope_value = p_space_id::text),
    (select f.enabled from ref.feature_flags f join public.spaces s on s.id = p_space_id
      where f.key = p_key and f.scope_type = 'country' and f.scope_value = s.country_code),
    (select f.enabled from ref.feature_flags f
      where f.key = p_key and f.scope_type = 'global'),
    false) end;
$$;

-- Derecho de supresión (RGPD art. 17): borra al usuario de verdad. Sin necesitar la clave secreta
-- en la web. Los espacios donde es el único propietario se borran con todos sus datos.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_space uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'insufficient_privilege';
  end if;
  if not private.meets_sensitive_aal() then
    raise exception 'Requiere verificación MFA reciente' using errcode = 'insufficient_privilege';
  end if;
  for v_space in
    select m.space_id from public.space_members m
    where m.user_id = v_uid and m.role = 'owner'
      and not exists (
        select 1 from public.space_members o
        where o.space_id = m.space_id and o.role = 'owner' and o.user_id <> v_uid)
  loop
    delete from public.spaces s where s.id = v_space;
  end loop;
  perform audit.log_event('account.deleted', 'user', encode(private.pseudonymize(v_uid::text), 'hex'), null, '{}'::jsonb);
  delete from auth.users u where u.id = v_uid;
end;
$$;
comment on function public.delete_my_account is 'Borrado real de la cuenta del usuario actual y de los espacios que solo él posee.';

-- Mantenimiento programado (pg_cron o una función programada): sin permisos para usuarios.
create function private.purge_expired() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_blanked bigint;
  v_deleted bigint;
begin
  update public.space_invitations i set email_normalized = null
   where i.email_normalized is not null and (i.expires_at < now() or i.revoked_at is not null);
  get diagnostics v_blanked = row_count;
  delete from public.space_invitations i
   where coalesce(i.accepted_at, i.revoked_at, i.expires_at) < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return jsonb_build_object('invitation_emails_cleared', v_blanked, 'invitations_deleted', v_deleted);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución (denegado por defecto; solo lo listado)
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema audit from public, anon, authenticated;
revoke execute on function
  public.create_space, public.create_invitation, public.accept_invitation,
  public.feature_enabled, public.delete_my_account
from public, anon;

grant execute on function
  private.member_role(uuid), private.can_read(uuid), private.can_write(uuid), private.is_owner(uuid),
  private.space_ids_for_roles(public.app_role[]),
  private.readable_space_ids(), private.peer_space_ids(), private.writable_space_ids(), private.owned_space_ids(),
  private.has_verified_mfa(), private.meets_sensitive_aal(), private.is_valid_isin(text)
to authenticated;

grant execute on function
  public.create_space, public.create_invitation, public.accept_invitation,
  public.feature_enabled, public.delete_my_account
to authenticated;

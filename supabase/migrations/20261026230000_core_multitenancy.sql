-- =============================================================================
-- Fase 0: multitenencia, auditoría y referencia.
-- ADR-0004 (RLS), ADR-0009 (auditoría), ADR-0011 (flags).
-- Reglas: RLS activada y forzada en toda tabla; anon sin permisos; funciones con
-- search_path vacío y nombres cualificados.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Esquemas y permisos por defecto
-- ---------------------------------------------------------------------------
create schema if not exists private;
create schema if not exists ref;
create schema if not exists audit;

comment on schema private is 'Funciones auxiliares de seguridad y tablas internas. No expuesto en la API.';
comment on schema ref is 'Datos de referencia compartidos (monedas, tipos de cambio, IPC, flags).';
comment on schema audit is 'Registro de auditoría inmutable. No expuesto en la API.';

revoke all on schema private, ref, audit from public, anon;
grant usage on schema private, ref to authenticated;

-- Supabase concede por defecto todo a anon/authenticated en public: lo quitamos para que
-- cada tabla nueva empiece denegada y los permisos se concedan de forma explícita.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema audit revoke execute on functions from public;

create type public.app_role as enum ('owner', 'editor', 'viewer', 'advisor');
comment on type public.app_role is 'Rol de un usuario en un espacio. advisor = asesor invitado de solo lectura con caducidad.';

-- ---------------------------------------------------------------------------
-- Configuración interna
-- ---------------------------------------------------------------------------
create table private.app_settings (
  key text primary key,
  value bytea not null
);
comment on table private.app_settings is 'Secretos internos de la base de datos (p. ej., pimienta de seudónimos de auditoría).';
alter table private.app_settings enable row level security;
alter table private.app_settings force row level security;

insert into private.app_settings (key, value)
values ('audit_pepper', extensions.gen_random_bytes(32));

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
  check ((scope_type = 'global') = (scope_value = ''))
);
comment on table ref.feature_flags is 'Feature flags. Precedencia: space > country > global (ADR-0011).';

insert into ref.feature_flags (key, scope_type, scope_value, enabled, note) values
  ('reco.level1', 'global', '', true, 'Contenido educativo y genérico'),
  ('reco.level2', 'global', '', false, 'Avisos por reglas: solo en países con plantillas revisadas'),
  ('reco.level2', 'country', 'ES', true, 'Plantillas de España'),
  ('reco.level3', 'global', '', false, 'Productos concretos: DESACTIVADO hasta validación legal'),
  ('ai.explanations', 'global', '', false, 'Requiere EIPD y consentimiento');

alter table ref.currencies enable row level security;
alter table ref.currencies force row level security;
alter table ref.feature_flags enable row level security;
alter table ref.feature_flags force row level security;
create policy currencies_read on ref.currencies for select to authenticated using (true);
create policy feature_flags_read on ref.feature_flags for select to authenticated using (true);
grant select on ref.currencies, ref.feature_flags to authenticated;

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
create index space_members_user_idx on public.space_members (user_id, space_id) include (role, expires_at);

create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  email_normalized text check (email_normalized is null or email_normalized = lower(email_normalized)),
  role public.app_role not null,
  advisor_days smallint check (advisor_days between 1 and 30),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint advisor_invite_requires_days check (role <> 'advisor' or advisor_days is not null)
);
comment on table public.space_invitations is 'Invitaciones de un solo uso. Solo se guarda el hash del token.';
comment on column public.space_invitations.email_normalized is 'Correo invitado; se borra al aceptar. [pii]';
create index space_invitations_space_idx on public.space_invitations (space_id);

-- ---------------------------------------------------------------------------
-- Funciones de autorización (usadas por las políticas RLS)
-- ---------------------------------------------------------------------------
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
comment on function private.member_role is 'Rol vigente del usuario actual en el espacio, o null. Security definer para no recursar en la RLS de space_members.';

create function private.can_read(p_space_id uuid) returns boolean
language sql stable set search_path = ''
as $$ select private.member_role(p_space_id) is not null; $$;

create function private.can_write(p_space_id uuid) returns boolean
language sql stable set search_path = ''
as $$ select coalesce(private.member_role(p_space_id) in ('owner', 'editor'), false); $$;

create function private.is_owner(p_space_id uuid) returns boolean
language sql stable set search_path = ''
as $$ select coalesce(private.member_role(p_space_id) = 'owner', false); $$;

create function private.has_verified_mfa() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = (select auth.uid()) and f.status = 'verified'
  );
$$;

-- Acciones sensibles: si el usuario tiene MFA, exigimos sesión AAL2.
create function private.meets_sensitive_aal() returns boolean
language sql stable set search_path = ''
as $$
  select not private.has_verified_mfa()
      or coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.member_role(uuid), private.can_read(uuid), private.can_write(uuid),
  private.is_owner(uuid), private.has_verified_mfa(), private.meets_sensitive_aal()
to authenticated;

-- ---------------------------------------------------------------------------
-- Auditoría inmutable encadenada (ADR-0009)
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
comment on table audit.events is 'Eventos de seguridad. Sin PII ni importes. Solo inserción; encadenado por hash.';
create index audit_events_space_idx on audit.events (space_id, occurred_at desc);
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

create function audit.log_event(
  p_action text, p_entity text, p_entity_id text, p_space_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_prev bytea;
  v_actor bytea;
  v_at timestamptz := clock_timestamp();
  v_canonical text;
begin
  -- Serializa las inserciones para que la cadena sea lineal.
  perform pg_advisory_xact_lock(hashtext('audit.events'));
  select e.hash into v_prev from audit.events e order by e.id desc limit 1;
  v_actor := case when auth.uid() is null then null else private.pseudonymize(auth.uid()::text) end;
  v_canonical := jsonb_build_object(
    'at', extract(epoch from v_at), 'actor', encode(v_actor, 'hex'), 'space', p_space_id, 'action', p_action,
    'entity', p_entity, 'entity_id', p_entity_id, 'metadata', coalesce(p_metadata, '{}'::jsonb)
  )::text;
  insert into audit.events (occurred_at, actor_hash, space_id, action, entity, entity_id, metadata, prev_hash, hash)
  values (
    v_at, v_actor, p_space_id, p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb), v_prev,
    extensions.digest(coalesce(v_prev, ''::bytea) || convert_to(v_canonical, 'UTF8'), 'sha256')
  );
end;
$$;
comment on function audit.log_event is 'Única vía de escritura en audit.events.';

-- Devuelve el id del primer evento cuya cadena no cuadra, o null si está íntegra.
create function audit.verify_chain() returns bigint
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  v_prev bytea := null;
  v_expected bytea;
begin
  for r in select * from audit.events order by id loop
    v_expected := extensions.digest(
      coalesce(v_prev, ''::bytea) || convert_to(jsonb_build_object(
        'at', extract(epoch from r.occurred_at), 'actor', encode(r.actor_hash, 'hex'), 'space', r.space_id,
        'action', r.action, 'entity', r.entity, 'entity_id', r.entity_id, 'metadata', r.metadata
      )::text, 'UTF8'),
      'sha256');
    if r.prev_hash is distinct from v_prev or r.hash <> v_expected then
      return r.id;
    end if;
    v_prev := r.hash;
  end loop;
  return null;
end;
$$;

-- Las tablas de auditoría no admiten cambios ni borrados, ni siquiera por el propietario.
create function audit.forbid_mutation() returns trigger
language plpgsql set search_path = ''
as $$ begin raise exception 'audit.events es de solo inserción' using errcode = 'insufficient_privilege'; end; $$;
create trigger audit_events_immutable before update or delete on audit.events
  for each row execute function audit.forbid_mutation();
create trigger audit_events_no_truncate before truncate on audit.events
  for each statement execute function audit.forbid_mutation();

revoke execute on all functions in schema audit from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Disparadores de mantenimiento
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

-- Perfil automático al registrarse.
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

revoke execute on all functions in schema private from public, anon;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.spaces enable row level security;
alter table public.spaces force row level security;
alter table public.space_members enable row level security;
alter table public.space_members force row level security;
alter table public.space_invitations enable row level security;
alter table public.space_invitations force row level security;

-- profiles: el propio perfil; y el de quien comparte espacio conmigo (salvo si soy asesor).
create policy profiles_select on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.space_members theirs
    where theirs.user_id = profiles.user_id
      and private.member_role(theirs.space_id) in ('owner', 'editor', 'viewer')
  )
);
create policy profiles_update on public.profiles for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- spaces: lectura para miembros; cambios y borrado solo propietarios con AAL suficiente.
-- La creación es solo mediante la RPC create_space.
create policy spaces_select on public.spaces for select to authenticated
using (private.can_read(id));
create policy spaces_update on public.spaces for update to authenticated
using (private.is_owner(id) and private.meets_sensitive_aal())
with check (private.is_owner(id));
create policy spaces_delete on public.spaces for delete to authenticated
using (private.is_owner(id) and private.meets_sensitive_aal());

-- space_members: el asesor solo ve su propia fila.
create policy space_members_select on public.space_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.member_role(space_id) in ('owner', 'editor', 'viewer')
);
create policy space_members_update on public.space_members for update to authenticated
using (private.is_owner(space_id) and private.meets_sensitive_aal())
with check (private.is_owner(space_id));
create policy space_members_delete on public.space_members for delete to authenticated
using (
  user_id = (select auth.uid())
  or (private.is_owner(space_id) and private.meets_sensitive_aal())
);

-- space_invitations: solo propietarios; creación y aceptación mediante RPC.
create policy space_invitations_select on public.space_invitations for select to authenticated
using (private.is_owner(space_id));
create policy space_invitations_revoke on public.space_invitations for update to authenticated
using (private.is_owner(space_id) and accepted_at is null)
with check (private.is_owner(space_id));

-- Permisos de columna: lo que no se concede, no se puede tocar aunque la política lo permita.
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

-- ---------------------------------------------------------------------------
-- RPC públicas (security definer justificado: crean filas que el usuario aún no puede ver)
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
  v_uid uuid := auth.uid();
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
          extensions.digest(v_token, 'sha256'), now() + interval '72 hours', auth.uid());
  return translate(encode(v_token, 'base64'), '+/=', '-_');
end;
$$;

create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
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

revoke execute on function public.create_space, public.create_invitation, public.accept_invitation,
  public.feature_enabled from public, anon;
grant execute on function public.create_space, public.create_invitation, public.accept_invitation,
  public.feature_enabled to authenticated;

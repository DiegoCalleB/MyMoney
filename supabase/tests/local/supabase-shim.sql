-- =============================================================================
-- SOLO PARA TESTS LOCALES SIN DOCKER. Imita lo mínimo que Supabase trae de serie:
-- roles, esquema auth (uid/jwt/users/mfa_factors), esquema extensions y los permisos
-- por defecto que Supabase concede en public (para comprobar que nuestras
-- migraciones los retiran). Nunca se aplica a un proyecto real.
-- =============================================================================
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema extensions;
create extension pgcrypto with schema extensions;
create extension pgtap with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
alter database mymoney set search_path = "$user", public, extensions;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);
create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('unverified', 'verified'))
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text;
$$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- Permisos por defecto de Supabase en public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Storage mínimo para probar las políticas (en Supabase real lo trae la plataforma).
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(regexp_replace(name, '/?[^/]*$', ''), '/');
$$;

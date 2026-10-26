-- Funciones auxiliares de los tests. Se ejecuta primero (orden alfabético) y NO hace
-- rollback, para que los demás archivos puedan usarlas. Nunca se aplica en producción.
begin;
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.create_user(p_email text) returns uuid
language sql security definer set search_path = ''
as $$ insert into auth.users (email) values (lower(p_email)) returning id; $$;

create or replace function tests.verify_mfa(p_user uuid) returns void
language sql security definer set search_path = ''
as $$ insert into auth.mfa_factors (user_id, status) values (p_user, 'verified'); $$;

-- Simula una petición de PostgREST con el JWT del usuario.
create or replace function tests.authenticate_as(p_user uuid, p_aal text default 'aal1') returns void
language plpgsql set search_path = ''
as $$
declare v_email text;
begin
  perform set_config('role', 'postgres', true);
  select u.email into v_email from auth.users u where u.id = p_user;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user, 'email', v_email, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.as_anon() returns void
language plpgsql set search_path = ''
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function tests.as_postgres() returns void
language plpgsql set search_path = ''
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select plan(1);
select pass('helpers de test instalados');
select * from finish();
commit;

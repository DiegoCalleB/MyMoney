-- Meta-test (sección 4 del plan): toda tabla de nuestros esquemas tiene RLS activada y
-- forzada, anon no tiene ningún permiso, y ninguna función es ejecutable por anon.
begin;
select plan(5);

select is(
  (select coalesce(array_agg(c.relnamespace::regnamespace || '.' || c.relname order by 1), '{}')
     from pg_class c
    where c.relkind in ('r', 'p')
      and c.relnamespace::regnamespace::text in ('public', 'ref', 'audit', 'private')
      and not (c.relrowsecurity and c.relforcerowsecurity)),
  '{}'::text[],
  'todas las tablas tienen RLS activada y forzada'
);

select is(
  (select coalesce(array_agg(table_schema || '.' || table_name || ':' || privilege_type order by 1), '{}')
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema in ('public', 'ref', 'audit', 'private')),
  '{}'::text[],
  'anon no tiene permisos sobre ninguna tabla'
);

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace::regnamespace::text in ('public', 'private', 'audit')
      and has_function_privilege('anon', p.oid, 'execute')),
  '{}'::text[],
  'anon no puede ejecutar ninguna de nuestras funciones'
);

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace::regnamespace::text in ('public', 'private', 'audit')
      and p.prosecdef
      and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false)),
  '{}'::text[],
  'toda función security definer fija search_path vacío'
);

select is(
  (select coalesce(array_agg(table_name::text order by 1), '{}')
     from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema = 'audit'),
  '{}'::text[],
  'authenticated no tiene acceso directo a la auditoría'
);

select * from finish();
rollback;

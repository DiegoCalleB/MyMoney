-- Metatests de seguridad (docs/plan/15-revision-bd.md). Se ejecutan sobre el catálogo: una tabla,
-- función o vista nueva que incumpla las reglas rompe el CI aunque nadie escriba un test para ella.
begin;
select plan(12);

select is(
  (select coalesce(array_agg(c.relnamespace::regnamespace || '.' || c.relname order by c.relname), '{}')
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
  'anon no tiene permisos sobre ninguna tabla ni vista'
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
      and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false)),
  '{}'::text[],
  'toda función fija search_path vacío (también las que no son security definer)'
);

select is(
  (select coalesce(array_agg(table_schema || '.' || table_name order by 1), '{}')
     from information_schema.role_table_grants
    where grantee = 'authenticated' and table_schema in ('audit', 'private')),
  '{}'::text[],
  'authenticated no tiene acceso directo a audit ni a private'
);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
      and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  '{}'::text[],
  'toda vista de public es security_invoker (respeta los permisos y la RLS de quien consulta)'
);

select is(
  (select coalesce(array_agg(g.table_name || ':' || g.privilege_type order by 1), '{}')
     from information_schema.role_table_grants g
    where g.grantee = 'authenticated' and g.table_schema = 'public'
      and g.table_name in ('transactions', 'transaction_legs')
      and g.privilege_type in ('INSERT', 'DELETE')),
  '{}'::text[],
  'el libro de movimientos no admite INSERT ni DELETE directos (solo por RPC)'
);

select is(
  (select coalesce(array_agg(g.table_name || '.' || g.column_name order by 1), '{}')
     from information_schema.columns g
    where g.table_schema = 'public' and g.column_name in ('space_id', 'id', 'created_at')
      and g.table_name in (select table_name from information_schema.columns
                            where table_schema = 'public' and column_name = 'space_id')
      -- CASE fija el orden: sin él, el planificador puede evaluar el permiso sobre tablas de otros esquemas.
      and case when g.table_schema = 'public'
               then has_column_privilege('authenticated', format('public.%I', g.table_name), g.column_name, 'UPDATE')
               else false end),
  '{}'::text[],
  'space_id, id y created_at no son actualizables por usuarios (el espacio de una fila es inmutable)'
);

select is(
  (select coalesce(array_agg(t.table_name::text order by 1), '{}')
     from information_schema.columns t
    where t.table_schema = 'public' and t.column_name = 'space_id'
      and not exists (
        select 1 from pg_policy p where p.polrelid = format('public.%I', t.table_name)::regclass and p.polcmd = 'r')),
  '{}'::text[],
  'toda tabla con space_id tiene política de lectura'
);

select is(
  (select coalesce(array_agg(p.polrelid::regclass::text || '.' || p.polname order by 1), '{}')
     from pg_policy p
    where p.polrelid::regclass::text ~ '^(public|ref)\.|^[a-z_]+$'
      and coalesce(pg_get_expr(p.polqual, p.polrelid), '') !~ 'readable_space_ids|peer_space_ids|writable_space_ids|owned_space_ids|auth\.uid|true'
      and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'readable_space_ids|peer_space_ids|writable_space_ids|owned_space_ids|auth\.uid|true'),
  '{}'::text[],
  'toda política se apoya en los arrays de espacios, en auth.uid() o es de referencia'
);

-- Las políticas deben evaluar las funciones una sola vez por consulta: envueltas en (select ...).
select is(
  (select coalesce(array_agg(p.polrelid::regclass::text || '.' || p.polname order by 1), '{}')
     from pg_policy p
    where p.polrelid::regclass::text !~ '^storage\.'
      and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          ~ '(private\.[a-z_]+_space_ids\(\)|auth\.uid\(\))'
      and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          !~ 'SELECT (private\.[a-z_]+_space_ids\(\)|auth\.uid\(\)|private\.meets_sensitive_aal\(\))'),
  '{}'::text[],
  'las políticas envuelven las funciones en (select ...) para no evaluarlas por fila'
);

-- La procedencia (quién introdujo un dato) no es editable por los usuarios en ninguna tabla.
select is(
  (select coalesce(array_agg(c.table_name || '.' || c.column_name order by 1), '{}')
     from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'entered_by'
      and has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'UPDATE')),
  '{}'::text[],
  'entered_by no es actualizable por usuarios'
);

select * from finish();
rollback;

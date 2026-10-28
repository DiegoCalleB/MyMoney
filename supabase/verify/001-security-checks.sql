-- Verificación posterior a aplicar las migraciones (solo lectura). Ejecútala en el editor SQL de
-- Supabase o con execute_sql: cada comprobación devuelve filas ÚNICAMENTE si hay una violación.
-- Resultado esperado: 0 filas. Replica los metatests pgTAP 001 y 050 sobre el catálogo real.
select 'rls_no_forzada' as comprobacion, c.relnamespace::regnamespace::text || '.' || c.relname as detalle
  from pg_class c
 where c.relkind in ('r', 'p') and c.relnamespace::regnamespace::text in ('public', 'ref', 'audit', 'private')
   and not (c.relrowsecurity and c.relforcerowsecurity)
union all
select 'anon_con_permisos_en_tabla', table_schema || '.' || table_name || ':' || privilege_type
  from information_schema.role_table_grants
 where grantee = 'anon' and table_schema in ('public', 'ref', 'audit', 'private')
union all
select 'anon_ejecuta_funcion', p.oid::regprocedure::text
  from pg_proc p
 where p.pronamespace::regnamespace::text in ('public', 'private', 'audit') and has_function_privilege('anon', p.oid, 'execute')
union all
select 'funcion_sin_search_path_vacio', p.oid::regprocedure::text
  from pg_proc p
 where p.pronamespace::regnamespace::text in ('public', 'private', 'audit')
   and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false)
union all
select 'authenticated_en_audit_o_private', table_schema || '.' || table_name
  from information_schema.role_table_grants
 where grantee = 'authenticated' and table_schema in ('audit', 'private')
union all
select 'vista_sin_security_invoker', c.relname::text
  from pg_class c
 where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
   and not coalesce('security_invoker=true' = any (c.reloptions), false)
union all
select 'escritura_directa_en_libro', g.table_name || ':' || g.privilege_type
  from information_schema.role_table_grants g
 where g.grantee = 'authenticated' and g.table_schema = 'public'
   and g.table_name in ('transactions', 'transaction_legs') and g.privilege_type in ('INSERT', 'DELETE')
union all
select 'columna_inmutable_actualizable', g.table_name || '.' || g.column_name
  from information_schema.columns g
 where g.table_schema = 'public' and g.column_name in ('space_id', 'id', 'created_at')
   and g.table_name in (select table_name from information_schema.columns where table_schema = 'public' and column_name = 'space_id')
   and has_column_privilege('authenticated', format('public.%I', g.table_name), g.column_name, 'UPDATE')
union all
select 'tabla_con_space_id_sin_politica_de_lectura', t.table_name::text
  from information_schema.columns t
 where t.table_schema = 'public' and t.column_name = 'space_id'
   and not exists (select 1 from pg_policy p where p.polrelid = format('public.%I', t.table_name)::regclass and p.polcmd = 'r')
union all
select 'politica_sin_envolver_en_select', p.polrelid::regclass::text || '.' || p.polname
  from pg_policy p
 where p.polrelid::regclass::text !~ '^storage\.'
   and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
       ~ '(private\.[a-z_]+_space_ids\(\)|auth\.uid\(\))'
   and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''))
       !~ 'SELECT (private\.[a-z_]+_space_ids\(\)|auth\.uid\(\)|private\.meets_sensitive_aal\(\))'
union all
select 'fk_no_compuesta_entre_tablas_con_space_id', c.conrelid::regclass::text || ' -> ' || c.confrelid::regclass::text || ' (' || c.conname || ')'
  from pg_constraint c
 where c.contype = 'f' and c.connamespace = 'public'::regnamespace
   and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'space_id' and not a.attisdropped)
   and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'space_id' and not a.attisdropped)
   and not exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'space_id' and a.attnum = any (c.conkey))
union all
select 'fk_sin_indice_de_apoyo', c.conrelid::regclass::text || ' (' || c.conname || ')'
  from pg_constraint c
 where c.contype = 'f' and c.connamespace in ('public'::regnamespace, 'ref'::regnamespace)
   and not exists (
     select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and (select array_agg(k order by k) from unnest((string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)]) k)
          = (select array_agg(k order by k) from unnest(c.conkey) k))
union all
select 'nivel_3_de_avisos_permitido', 'public.recommendations'
 where not exists (
   select 1 from pg_constraint c
    where c.conrelid = 'public.recommendations'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%level <= 2%')
union all
select 'flag_nivel_3_activada', f.key || ':' || f.scope_type || ':' || f.scope_value
  from ref.feature_flags f
 where f.key = 'reco.level3' and f.enabled
union all
select 'bucket_imports_publico_o_inexistente', 'imports'
 where not exists (select 1 from storage.buckets b where b.id = 'imports' and not b.public)
union all
select 'rol_postgres_sin_bypassrls', 'postgres'
 where not exists (select 1 from pg_roles where rolname = 'postgres' and rolbypassrls)
order by 1, 2;

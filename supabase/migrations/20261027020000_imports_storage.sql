-- =============================================================================
-- 4/5 · Importación de extractos (ADR-0008) y almacenamiento privado de archivos.
-- Las importaciones las ven los miembros sin asesores; escriben propietarios y editores.
-- =============================================================================

create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  institution_hint text check (char_length(institution_hint) <= 80),
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object' and pg_column_size(mapping) <= 16384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  unique (space_id, name)
);
comment on column public.import_mappings.name is 'Nombre libre del mapeo. [pii]';
comment on table public.import_mappings is 'Mapeo de columnas guardado por entidad (columnas, formato de fecha, separador decimal, signos).';

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  account_id uuid not null,
  mapping_id uuid,
  file_kind text not null check (file_kind in ('csv', 'xlsx', 'pdf')),
  file_sha256 bytea not null check (octet_length(file_sha256) = 32),
  storage_path text check (char_length(storage_path) <= 300),
  keep_original boolean not null default false,
  original_deleted_at timestamptz,
  row_count integer not null default 0 check (row_count between 0 and 100000),
  status text not null default 'previewed' check (status in ('previewed', 'committed', 'reverted')),
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  unique (id, space_id),
  -- Nivel archivo de ADR-0008: el mismo archivo no se importa dos veces en una cuenta.
  unique (space_id, account_id, file_sha256),
  foreign key (account_id, space_id) references public.accounts (id, space_id),
  foreign key (mapping_id, space_id) references public.import_mappings (id, space_id) on delete set null (mapping_id),
  -- El archivo vive bajo la carpeta de su espacio (la política de Storage lo exige también).
  check (storage_path is null or storage_path like space_id::text || '/%'),
  check ((original_deleted_at is null) or (storage_path is null))
);
comment on table public.import_batches is 'Un archivo importado. Solo se extraen fechas, importes, tipo, producto y cantidad (nunca IBAN, dirección ni titular). El original se borra al confirmar la importación salvo que el usuario pida conservarlo (keep_original); la huella file_sha256 se conserva para no importarlo dos veces.';
comment on column public.import_batches.storage_path is 'Ruta del original en el bucket privado; nula cuando el original ya se borró.';
create index import_batches_mapping_idx on public.import_batches (space_id, mapping_id) where mapping_id is not null;

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  account_id uuid not null,
  row_index integer not null check (row_index >= 0),
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  status text not null check (status in ('new', 'duplicate', 'error', 'imported')),
  error_code text check (char_length(error_code) <= 40),
  transaction_id uuid,
  created_at timestamptz not null default now(),
  unique (batch_id, space_id, row_index),
  foreign key (batch_id, space_id) references public.import_batches (id, space_id) on delete cascade,
  foreign key (account_id, space_id) references public.accounts (id, space_id),
  foreign key (transaction_id, space_id) references public.transactions (id, space_id) on delete set null (transaction_id)
);
comment on table public.import_rows is 'Filas de un archivo con su huella (ADR-0008). El índice único parcial impide importar dos veces la misma fila en una cuenta.';
-- Nivel fila de ADR-0008.
create unique index import_rows_fingerprint_idx on public.import_rows (space_id, account_id, fingerprint)
  where status = 'imported';
create index import_rows_account_idx on public.import_rows (space_id, account_id);
create index import_rows_tx_idx on public.import_rows (space_id, transaction_id) where transaction_id is not null;

-- Procedencia: una valoración tomada de un extracto apunta a su importación.
alter table public.valuations add column import_batch_id uuid,
  add foreign key (import_batch_id, space_id) references public.import_batches (id, space_id) on delete set null (import_batch_id);
comment on column public.valuations.import_batch_id is 'Importación de la que sale el valor (source csv o statement), para enseñar de dónde viene la cifra.';
create index valuations_import_batch_idx on public.valuations (space_id, import_batch_id) where import_batch_id is not null;

do $$
begin
  perform private.secure_space_table('import_mappings', p_read => 'peer');
  perform private.secure_space_table('import_batches', p_read => 'peer');
  perform private.secure_space_table('import_rows', p_read => 'peer');
end $$;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado "imports", ruta <space_id>/<archivo>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports', 'imports', false, 5242880,
  array['text/csv', 'text/plain', 'application/pdf', 'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy imports_select on storage.objects for select to authenticated
using (bucket_id = 'imports' and (storage.foldername(name))[1] = any ((select private.peer_space_ids())::text[]));
create policy imports_insert on storage.objects for insert to authenticated
with check (bucket_id = 'imports' and (storage.foldername(name))[1] = any ((select private.writable_space_ids())::text[]));
create policy imports_update on storage.objects for update to authenticated
using (bucket_id = 'imports' and (storage.foldername(name))[1] = any ((select private.writable_space_ids())::text[]))
with check (bucket_id = 'imports' and (storage.foldername(name))[1] = any ((select private.writable_space_ids())::text[]));
create policy imports_delete on storage.objects for delete to authenticated
using (bucket_id = 'imports' and (storage.foldername(name))[1] = any ((select private.writable_space_ids())::text[]));

grant update (import_batch_id) on public.valuations to authenticated;

-- Permisos de ejecución (las funciones de private se vuelven a conceder tras cada migración).
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.member_role(uuid), private.can_read(uuid), private.can_write(uuid), private.is_owner(uuid),
  private.space_ids_for_roles(public.app_role[]),
  private.readable_space_ids(), private.peer_space_ids(), private.writable_space_ids(), private.owned_space_ids(),
  private.has_verified_mfa(), private.meets_sensitive_aal(), private.is_valid_isin(text)
to authenticated;

-- =============================================================================
-- Conexiones automáticas (ADR-0022, docs/plan/16-integraciones.md): conexiones con proveedores,
-- bóveda de credenciales cifradas, cola de sincronización, cubo de fichas y la única vía de
-- escritura de lo que traen las sincronizaciones (ingest_sync).
--
-- Aditiva y compatible hacia atrás: tablas y funciones nuevas; solo se AMPLÍAN los valores
-- permitidos de tres restricciones (origen 'api'). Mismas reglas del proyecto: FKs compuestas por
-- espacio, RLS forzada, permisos mínimos y funciones con search_path vacío.
--
-- Quién puede qué:
--  · Usuarios (authenticated): ver las conexiones de su espacio (sin asesores), crear una conexión
--    pendiente, vincular cuentas, pedir una sincronización (con límite) y revocar.
--  · Solo service_role (la Edge Function de sincronización): bóveda, cola, cubo de fichas e
--    ingesta. Las funciones lo comprueban además de los permisos de ejecución.
--  · Las tablas de private no se leen ni escriben desde fuera de estas funciones.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Amplía los orígenes admitidos con 'api' (lo que traen las sincronizaciones)
-- ---------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check
  check (source in ('manual', 'csv', 'statement', 'computed', 'api'));
alter table public.valuations drop constraint valuations_source_check;
alter table public.valuations add constraint valuations_source_check
  check (source in ('manual', 'csv', 'statement', 'price_feed', 'computed', 'api'));
alter table public.import_batches drop constraint import_batches_file_kind_check;
alter table public.import_batches add constraint import_batches_file_kind_check
  check (file_kind in ('csv', 'xlsx', 'pdf', 'api'));

-- ---------------------------------------------------------------------------
-- Conexiones
-- ---------------------------------------------------------------------------
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  institution_id uuid,
  kind text not null check (kind in ('psd2', 'api')),
  provider text not null check (provider in ('enable_banking', 'binance', 'etoro')),
  status text not null default 'pending' check (status in (
    'pending', 'active', 'needs_attention', 'expired', 'revoked')),
  consent_expires_at timestamptz,
  sync_minute smallint not null default (floor(random() * 1440))::smallint
    check (sync_minute between 0 and 1439),
  last_requested_at timestamptz,
  last_success_at timestamptz,
  last_error_code text check (char_length(last_error_code) <= 40),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id),
  foreign key (institution_id, space_id) references public.institutions (id, space_id)
    on delete set null (institution_id),
  check ((provider = 'enable_banking') = (kind = 'psd2'))
);
comment on table public.connections is 'Conexión automática de un espacio con un proveedor (PSD2 o API de solo lectura). CSV y manual no son conexiones. Los secretos viven cifrados en private.connection_secrets. [financiero]';
comment on column public.connections.kind is 'psd2 = agregador autorizado; api = API del proveedor con credenciales de solo lectura del usuario.';
comment on column public.connections.status is 'pending hasta validar las credenciales; needs_attention tras fallos repetidos o credenciales rechazadas; expired al caducar el consentimiento; revoked es definitivo.';
comment on column public.connections.consent_expires_at is 'PSD2: caducidad del consentimiento (hasta 180 días). Se avisa 14 días antes.';
comment on column public.connections.sync_minute is 'Minuto UTC del día (0-1439) al que se programa la sincronización diaria: reparte la carga entre conexiones.';
comment on column public.connections.last_requested_at is 'Última vez que el usuario pidió sincronizar (límite: una cada 15 minutos).';
comment on column public.connections.last_error_code is 'Código corto del último fallo, nunca el mensaje del proveedor.';
comment on column public.connections.created_by is 'Quien creó la conexión. [pii]';
create index connections_space_idx on public.connections (space_id, status);
create index connections_institution_idx on public.connections (space_id, institution_id) where institution_id is not null;
create index connections_created_by_idx on public.connections (created_by) where created_by is not null;
create index connections_due_idx on public.connections (sync_minute) where status = 'active';

-- Cuántas conexiones: tope por espacio (abuso y costes). Las revocadas no cuentan.
create function private.guard_connection_limit() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.connections c where c.space_id = new.space_id and c.status <> 'revoked') >= 20 then
    raise exception 'Un espacio admite como máximo 20 conexiones activas' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger connections_limit before insert on public.connections
  for each row execute function private.guard_connection_limit();

-- Qué cuenta del proveedor alimenta qué cuenta del espacio.
create table public.connection_accounts (
  connection_id uuid not null,
  space_id uuid not null references public.spaces (id) on delete cascade,
  account_id uuid not null,
  external_ref text not null check (char_length(external_ref) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (connection_id, external_ref),
  unique (space_id, account_id),
  foreign key (connection_id, space_id) references public.connections (id, space_id) on delete cascade,
  foreign key (account_id, space_id) references public.accounts (id, space_id) on delete cascade
);
comment on table public.connection_accounts is 'Vincula una cuenta del proveedor (identificador opaco, nunca el IBAN) con una cuenta del espacio. Una cuenta se alimenta de una sola conexión. [financiero]';
comment on column public.connection_accounts.external_ref is 'Identificador opaco de la cuenta en el proveedor (p. ej., "spot"). Nunca un IBAN ni un número de cuenta.';
create index connection_accounts_connection_idx on public.connection_accounts (connection_id, space_id);

do $$
begin
  perform private.secure_space_table('connection_accounts', p_read => 'peer');
  -- connections: lectura para miembros (sin asesores). Alta solo como pendiente y a nombre de quien
  -- la crea; sin UPDATE ni DELETE directos: cambian de estado las funciones de abajo.
  perform private.secure_space_table('connections', p_read => 'peer', p_crud => false);
end $$;
create policy connections_insert on public.connections for insert to authenticated
with check (
  space_id = any ((select private.writable_space_ids())::uuid[])
  and status = 'pending'
  and created_by = (select auth.uid())
);
grant insert (space_id, institution_id, kind, provider, created_by) on public.connections to authenticated;

-- ---------------------------------------------------------------------------
-- Bóveda: secretos cifrados con cifrado de sobre (AES-256-GCM en la Edge Function). En la base de
-- datos solo hay texto cifrado: la clave maestra (KEK) vive fuera. Ninguna política: nadie la lee
-- salvo las funciones de este archivo.
-- ---------------------------------------------------------------------------
create table private.connection_secrets (
  connection_id uuid primary key,
  space_id uuid not null,
  ciphertext bytea not null check (octet_length(ciphertext) between 16 and 8192),
  nonce bytea not null check (octet_length(nonce) = 12),
  wrapped_dek bytea not null check (octet_length(wrapped_dek) between 16 and 256),
  wrap_nonce bytea not null check (octet_length(wrap_nonce) = 12),
  kek_version smallint not null check (kek_version > 0),
  public_hint text check (char_length(public_hint) <= 200),
  created_at timestamptz not null default now(),
  foreign key (connection_id, space_id) references public.connections (id, space_id) on delete cascade
);
comment on table private.connection_secrets is 'Credenciales de una conexión: AES-256-GCM con una clave por secreto (wrapped_dek) cifrada con la clave maestra que vive fuera de la base de datos. La AAD liga el texto cifrado a su espacio y conexión. [financiero]';
comment on column private.connection_secrets.public_hint is 'Parte pública que se puede mostrar (p. ej., huella de la clave pública). Nunca un secreto.';
create index connection_secrets_space_idx on private.connection_secrets (connection_id, space_id);
alter table private.connection_secrets enable row level security;
alter table private.connection_secrets force row level security;
revoke all on private.connection_secrets from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cola de sincronización y cubo de fichas
-- ---------------------------------------------------------------------------
create table private.sync_jobs (
  id bigint generated always as identity primary key,
  connection_id uuid not null,
  space_id uuid not null,
  kind text not null check (kind in ('sync')),
  state text not null default 'queued' check (state in ('queued', 'running', 'done', 'failed')),
  run_after timestamptz not null default now(),
  locked_until timestamptz,
  attempts smallint not null default 0,
  last_error_code text check (char_length(last_error_code) <= 40),
  created_at timestamptz not null default now(),
  foreign key (connection_id, space_id) references public.connections (id, space_id) on delete cascade
);
comment on table private.sync_jobs is 'Cola de sincronizaciones. Un solo trabajo vivo (en cola o en curso) por conexión y tipo.';
create unique index sync_jobs_live_idx on private.sync_jobs (connection_id, kind) where state in ('queued', 'running');
create index sync_jobs_ready_idx on private.sync_jobs (run_after, id) where state = 'queued';
create index sync_jobs_locked_idx on private.sync_jobs (locked_until) where state = 'running';
create index sync_jobs_connection_idx on private.sync_jobs (connection_id, space_id);
alter table private.sync_jobs enable row level security;
alter table private.sync_jobs force row level security;
revoke all on private.sync_jobs from public, anon, authenticated;

create table private.rate_buckets (
  bucket text primary key check (char_length(bucket) between 1 and 100),
  capacity numeric not null check (capacity > 0),
  tokens numeric not null check (tokens >= 0),
  refill_per_sec numeric not null check (refill_per_sec > 0),
  updated_at timestamptz not null default now(),
  check (tokens <= capacity)
);
comment on table private.rate_buckets is 'Cubos de fichas para no superar los límites de peticiones de terceros (por proveedor y por conexión).';
alter table private.rate_buckets enable row level security;
alter table private.rate_buckets force row level security;
revoke all on private.rate_buckets from public, anon, authenticated;

-- Pide n fichas al cubo (lo crea lleno si no existe). Devuelve 0 si las ha tomado o los segundos que
-- hay que esperar si no hay suficientes; en ese caso no consume ninguna.
create function private.take_tokens(
  p_bucket text, p_n numeric, p_capacity numeric, p_refill_per_sec numeric
) returns integer
language plpgsql set search_path = ''
as $$
declare
  v_b private.rate_buckets;
  v_now timestamptz := clock_timestamp();
  v_tokens numeric;
begin
  if p_n <= 0 or p_n > p_capacity then
    raise exception 'Petición de fichas no válida' using errcode = 'invalid_parameter_value';
  end if;
  insert into private.rate_buckets (bucket, capacity, tokens, refill_per_sec, updated_at)
  values (p_bucket, p_capacity, p_capacity, p_refill_per_sec, v_now)
  on conflict (bucket) do nothing;
  select b.* into v_b from private.rate_buckets b where b.bucket = p_bucket for update;
  v_tokens := least(v_b.capacity, v_b.tokens + extract(epoch from (v_now - v_b.updated_at)) * v_b.refill_per_sec);
  if v_tokens >= p_n then
    update private.rate_buckets set tokens = v_tokens - p_n, updated_at = v_now where bucket = p_bucket;
    return 0;
  end if;
  update private.rate_buckets set tokens = v_tokens, updated_at = v_now where bucket = p_bucket;
  return ceil((p_n - v_tokens) / v_b.refill_per_sec)::integer;
end;
$$;
comment on function private.take_tokens is 'Cubo de fichas atómico (FOR UPDATE): 0 = fichas tomadas; >0 = segundos de espera, sin consumir.';

-- ---------------------------------------------------------------------------
-- Funciones para usuarios autenticados
-- ---------------------------------------------------------------------------
-- ¿Puede el usuario gestionar esta conexión? security invoker: lo decide la RLS del propio usuario.
-- La Edge Function lo llama con el JWT de quien pide la acción antes de usar la clave del servidor.
create function public.can_manage_connection(p_connection_id uuid) returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(
    (select private.can_write(c.space_id) and private.meets_sensitive_aal()
       from public.connections c where c.id = p_connection_id),
    false);
$$;
comment on function public.can_manage_connection is 'true si el usuario autenticado puede escribir en el espacio de la conexión y, si tiene segundo factor, lo ha verificado en esta sesión (regla 10: conectar o cambiar credenciales es una acción sensible). RLS: solo ve las suyas.';

-- Pide una sincronización. security definer: encola en private.sync_jobs, que el usuario no toca.
-- Comprueba permiso de escritura y limita a una petición cada 15 minutos por conexión.
create function public.request_sync(p_connection_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.connections;
  v_n integer;
begin
  select c.* into v_c from public.connections c where c.id = p_connection_id for update;
  if not found or not private.can_write(v_c.space_id) then
    raise exception 'Conexión no encontrada o sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_c.status <> 'active' then
    raise exception 'La conexión no está activa' using errcode = 'check_violation';
  end if;
  if v_c.last_requested_at is not null and v_c.last_requested_at > now() - interval '15 minutes' then
    return jsonb_build_object('queued', false, 'reason', 'too_soon');
  end if;
  insert into private.sync_jobs (connection_id, space_id, kind)
  values (v_c.id, v_c.space_id, 'sync')
  on conflict (connection_id, kind) where state in ('queued', 'running') do nothing;
  get diagnostics v_n = row_count;
  update public.connections set last_requested_at = now() where id = v_c.id;
  return jsonb_build_object('queued', v_n = 1, 'reason', case when v_n = 1 then 'queued' else 'already_queued' end);
end;
$$;
comment on function public.request_sync is 'Encola una sincronización de la conexión (máximo una petición cada 15 minutos).';

-- Revoca una conexión: la deja inutilizable (estado revocado), borra su secreto y sus trabajos
-- pendientes. Usuario con permiso de escritura y AAL suficiente (regla 10), o el servidor (p. ej., credenciales rechazadas).
-- No revoca nada en el proveedor: la interfaz pide además borrar la clave allí.
create function public.revoke_connection(p_connection_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.connections;
begin
  select c.* into v_c from public.connections c where c.id = p_connection_id for update;
  if not found or not ((select auth.role()) = 'service_role'
                       or (private.can_write(v_c.space_id) and private.meets_sensitive_aal())) then
    raise exception 'Conexión no encontrada o sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_c.status = 'revoked' then
    return;
  end if;
  delete from private.connection_secrets where connection_id = v_c.id;
  delete from private.sync_jobs where connection_id = v_c.id and state in ('queued', 'running');
  update public.connections set status = 'revoked' where id = v_c.id;
  perform audit.log_event('connection.revoked', 'connection', v_c.id::text, v_c.space_id,
    jsonb_build_object('provider', v_c.provider));
end;
$$;
comment on function public.revoke_connection is 'Revoca la conexión (definitivo), borra su secreto y cancela lo pendiente.';

-- ---------------------------------------------------------------------------
-- Funciones solo para el servidor (service_role)
-- ---------------------------------------------------------------------------
create function public.put_connection_secret(
  p_connection_id uuid, p_ciphertext bytea, p_nonce bytea, p_wrapped_dek bytea, p_wrap_nonce bytea,
  p_kek_version smallint, p_public_hint text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.connections;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede guardar secretos' using errcode = 'insufficient_privilege';
  end if;
  select c.* into v_c from public.connections c where c.id = p_connection_id for update;
  if not found or v_c.status not in ('pending', 'active', 'needs_attention') then
    raise exception 'La conexión no admite secretos' using errcode = 'check_violation';
  end if;
  insert into private.connection_secrets
    (connection_id, space_id, ciphertext, nonce, wrapped_dek, wrap_nonce, kek_version, public_hint)
  values (v_c.id, v_c.space_id, p_ciphertext, p_nonce, p_wrapped_dek, p_wrap_nonce, p_kek_version, p_public_hint)
  on conflict (connection_id) do update
    set ciphertext = excluded.ciphertext, nonce = excluded.nonce, wrapped_dek = excluded.wrapped_dek,
        wrap_nonce = excluded.wrap_nonce, kek_version = excluded.kek_version, public_hint = excluded.public_hint;
  perform audit.log_event('connection.secret_stored', 'connection', v_c.id::text, v_c.space_id,
    jsonb_build_object('provider', v_c.provider));
end;
$$;
comment on function public.put_connection_secret is 'Guarda (o sustituye) el secreto cifrado de una conexión. Solo service_role. El contenido nunca se registra.';

create function public.get_connection_secret(p_connection_id uuid)
returns table (
  space_id uuid, ciphertext bytea, nonce bytea, wrapped_dek bytea, wrap_nonce bytea, kek_version smallint,
  public_hint text, provider text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede leer secretos' using errcode = 'insufficient_privilege';
  end if;
  return query
    select s.space_id, s.ciphertext, s.nonce, s.wrapped_dek, s.wrap_nonce, s.kek_version, s.public_hint, c.provider
    from private.connection_secrets s
    join public.connections c on c.id = s.connection_id and c.space_id = s.space_id
    where s.connection_id = p_connection_id and c.status in ('pending', 'active');
end;
$$;
comment on function public.get_connection_secret is 'Devuelve el secreto cifrado de una conexión pendiente o activa. Solo service_role.';

create function public.activate_connection(p_connection_id uuid, p_consent_expires_at timestamptz default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.connections;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede activar conexiones' using errcode = 'insufficient_privilege';
  end if;
  select c.* into v_c from public.connections c where c.id = p_connection_id for update;
  if not found or v_c.status not in ('pending', 'needs_attention', 'expired') then
    raise exception 'La conexión no se puede activar' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from private.connection_secrets s where s.connection_id = v_c.id) then
    raise exception 'La conexión no tiene credenciales' using errcode = 'check_violation';
  end if;
  update public.connections
    set status = 'active', consent_expires_at = p_consent_expires_at, last_error_code = null
    where id = v_c.id;
  perform audit.log_event('connection.activated', 'connection', v_c.id::text, v_c.space_id,
    jsonb_build_object('provider', v_c.provider));
end;
$$;
comment on function public.activate_connection is 'Marca la conexión como activa tras validar sus credenciales. Solo service_role.';

create function public.get_connection_info(p_connection_id uuid)
returns table (space_id uuid, provider text, status text)
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede leer conexiones' using errcode = 'insufficient_privilege';
  end if;
  return query
    select c.space_id, c.provider, c.status from public.connections c where c.id = p_connection_id;
end;
$$;
comment on function public.get_connection_info is 'Espacio, proveedor y estado de una conexión, para la Edge Function. Solo service_role.';

create function public.take_rate_tokens(
  p_bucket text, p_n numeric, p_capacity numeric, p_refill_per_sec numeric
) returns integer
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede usar el cubo de fichas' using errcode = 'insufficient_privilege';
  end if;
  return private.take_tokens(p_bucket, p_n, p_capacity, p_refill_per_sec);
end;
$$;
comment on function public.take_rate_tokens is 'Cubo de fichas para los límites de terceros: 0 = tomadas; >0 = segundos de espera. Solo service_role.';

-- Reclama trabajos de la cola (SKIP LOCKED: varios workers no se pisan). Recupera los que se
-- quedaron en curso con el plazo vencido (un worker caído).
create function public.claim_sync_jobs(p_limit integer default 10)
returns table (job_id bigint, connection_id uuid, space_id uuid, kind text, attempts smallint, provider text)
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede reclamar trabajos' using errcode = 'insufficient_privilege';
  end if;
  update private.sync_jobs j set state = 'queued', locked_until = null
    where j.state = 'running' and j.locked_until < now();
  return query
    with next as (
      select j.id from private.sync_jobs j
      where j.state = 'queued' and j.run_after <= now()
      order by j.run_after, j.id
      for update skip locked
      limit least(greatest(coalesce(p_limit, 10), 1), 50)
    ), claimed as (
      update private.sync_jobs j
        set state = 'running', locked_until = now() + interval '5 minutes', attempts = j.attempts + 1
      from next
      where j.id = next.id
      returning j.id as job_id, j.connection_id as connection_id, j.space_id as space_id, j.kind as kind, j.attempts as attempts
    )
    select cl.job_id, cl.connection_id, cl.space_id, cl.kind, cl.attempts, c.provider
    from claimed cl
    join public.connections c on c.id = cl.connection_id and c.space_id = cl.space_id
    order by cl.job_id;
end;
$$;
comment on function public.claim_sync_jobs is 'Reclama hasta p_limit (máx. 50) trabajos listos. Solo service_role.';

-- Cierra un trabajo: hecho, reintentar más tarde (con retroceso; a los 5 intentos falla) o fallido.
-- Un fallo deja la conexión en needs_attention con un código corto.
create function public.finish_sync_job(
  p_job_id bigint, p_outcome text, p_error_code text default null, p_retry_in_seconds integer default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_j private.sync_jobs;
  v_code text := left(p_error_code, 40);
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede cerrar trabajos' using errcode = 'insufficient_privilege';
  end if;
  if p_outcome not in ('done', 'retry', 'failed') then
    raise exception 'Resultado no válido' using errcode = 'invalid_parameter_value';
  end if;
  select j.* into v_j from private.sync_jobs j where j.id = p_job_id and j.state = 'running' for update;
  if not found then
    raise exception 'El trabajo no está en curso' using errcode = 'check_violation';
  end if;
  if p_outcome = 'done' then
    update private.sync_jobs set state = 'done', locked_until = null, last_error_code = null where id = v_j.id;
  elsif p_outcome = 'retry' and v_j.attempts < 5 then
    update private.sync_jobs
      set state = 'queued', locked_until = null, last_error_code = v_code,
          run_after = now() + make_interval(secs => least(greatest(coalesce(p_retry_in_seconds, 60), 30), 86400))
      where id = v_j.id;
  else
    update private.sync_jobs set state = 'failed', locked_until = null, last_error_code = v_code where id = v_j.id;
    update public.connections
      set status = 'needs_attention', last_error_code = v_code
      where id = v_j.connection_id and space_id = v_j.space_id and status = 'active';
  end if;
end;
$$;
comment on function public.finish_sync_job is 'Cierra un trabajo en curso (done | retry | failed). Solo service_role.';

-- Programa las sincronizaciones diarias (cada conexión activa a su minuto) y marca como caducadas
-- las que pasaron su consentimiento. La llama pg_cron; también la puede llamar el servidor.
create function public.schedule_due_syncs() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
  v_minute integer := (extract(hour from now() at time zone 'utc') * 60 + extract(minute from now() at time zone 'utc'))::integer;
begin
  if (select auth.role()) is distinct from 'service_role' and current_user <> 'postgres' then
    raise exception 'Solo el servidor puede programar sincronizaciones' using errcode = 'insufficient_privilege';
  end if;
  update public.connections set status = 'expired'
    where status = 'active' and consent_expires_at is not null and consent_expires_at < now();
  insert into private.sync_jobs (connection_id, space_id, kind)
  select c.id, c.space_id, 'sync'
  from public.connections c
  where c.status = 'active'
    and c.sync_minute <= v_minute
    and (c.last_success_at is null or c.last_success_at < date_trunc('day', now() at time zone 'utc') at time zone 'utc')
  on conflict (connection_id, kind) where state in ('queued', 'running') do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
comment on function public.schedule_due_syncs is 'Encola la sincronización diaria de cada conexión activa (a su minuto) y caduca los consentimientos vencidos.';

-- ---------------------------------------------------------------------------
-- Ingesta: la única vía por la que una sincronización escribe movimientos y valoraciones.
-- security definer, solo service_role. Comprueba que la conexión está activa y que cada cuenta del
-- payload está vinculada a ESTA conexión; la moneda sale de la cuenta, nunca del payload.
-- Es idempotente: cada movimiento lleva la huella de su identificador en el proveedor
-- (ADR-0008, punto 3) y el mismo payload no crea un segundo lote.
--
-- p_payload: {
--   "flows": [{ "external_ref", "id", "occurred_on", "kind": contribution|withdrawal|dividend|interest,
--               "amount_minor": "importe positivo", "currency", "description" }],
--   "valuations": [{ "external_ref", "as_of", "value_minor", "currency" }]
-- }
-- ---------------------------------------------------------------------------
create function public.ingest_sync(p_connection_id uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_c public.connections;
  v_flows jsonb;
  v_vals jsonb;
  v_ref record;
  v_batch uuid;
  v_new integer := 0;
  v_dup integer := 0;
  v_vals_n integer := 0;
  v_added integer;
  v_account public.accounts;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Solo el servidor puede ingerir sincronizaciones' using errcode = 'insufficient_privilege';
  end if;
  select c.* into v_c from public.connections c where c.id = p_connection_id for update;
  if not found or v_c.status <> 'active' then
    raise exception 'La conexión no está activa' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'El payload debe ser un objeto JSON' using errcode = 'invalid_parameter_value';
  end if;
  v_flows := coalesce(p_payload -> 'flows', '[]'::jsonb);
  v_vals := coalesce(p_payload -> 'valuations', '[]'::jsonb);
  if jsonb_typeof(v_flows) is distinct from 'array' or jsonb_typeof(v_vals) is distinct from 'array'
     or jsonb_array_length(v_flows) > 2000 or jsonb_array_length(v_vals) > 200 then
    raise exception 'Payload fuera de límites' using errcode = 'invalid_parameter_value';
  end if;

  -- Validación de forma de cada elemento, antes de escribir nada.
  if exists (
    select 1 from jsonb_to_recordset(v_flows) as f(external_ref text, id text, occurred_on date, kind text, amount_minor bigint, currency text)
    where f.external_ref is null or f.id is null or char_length(f.id) not between 1 and 100
       or f.occurred_on is null or f.kind is null or f.kind not in ('contribution', 'withdrawal', 'dividend', 'interest')
       or f.amount_minor is null or f.amount_minor not between 1 and 1000000000000000 or f.currency is null
  ) or exists (
    select 1 from jsonb_to_recordset(v_vals) as v(external_ref text, as_of date, value_minor bigint, currency text)
    where v.external_ref is null or v.as_of is null or v.as_of > (now() at time zone 'utc')::date + 1
       or v.value_minor is null or v.value_minor not between 0 and 1000000000000000 or v.currency is null
  ) then
    raise exception 'Hay movimientos o valoraciones no válidos' using errcode = 'invalid_parameter_value';
  end if;

  -- Cuentas del payload: todas vinculadas a esta conexión y en la moneda de la cuenta.
  for v_ref in
    select r.external_ref from (
      select f.external_ref from jsonb_to_recordset(v_flows) as f(external_ref text)
      union
      select v.external_ref from jsonb_to_recordset(v_vals) as v(external_ref text)
    ) r
  loop
    select a.* into v_account
    from public.connection_accounts ca
    join public.accounts a on a.id = ca.account_id and a.space_id = ca.space_id
    where ca.connection_id = v_c.id and ca.space_id = v_c.space_id and ca.external_ref = v_ref.external_ref;
    if not found then
      raise exception 'Cuenta del proveedor no vinculada a la conexión' using errcode = 'foreign_key_violation';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(v_flows) as f(external_ref text, currency text)
      where f.external_ref = v_ref.external_ref and f.currency is distinct from v_account.currency
    ) or exists (
      select 1 from jsonb_to_recordset(v_vals) as v(external_ref text, currency text)
      where v.external_ref = v_ref.external_ref and v.currency is distinct from v_account.currency
    ) then
      raise exception 'La moneda no coincide con la de la cuenta' using errcode = 'check_violation';
    end if;
  end loop;

  -- Movimientos: un lote por cuenta (misma maquinaria que la importación de archivos).
  for v_ref in
    select ca.account_id, ca.external_ref,
           encode(extensions.digest(convert_to(
             (select jsonb_agg(to_jsonb(x) order by x.id)::text
                from jsonb_to_recordset(v_flows) as x(external_ref text, id text, occurred_on date, kind text, amount_minor bigint, currency text)
               where x.external_ref = ca.external_ref), 'UTF8'), 'sha256'), 'hex') as digest_hex
    from public.connection_accounts ca
    where ca.connection_id = v_c.id and ca.space_id = v_c.space_id
      and exists (select 1 from jsonb_to_recordset(v_flows) as f(external_ref text) where f.external_ref = ca.external_ref)
  loop
    insert into public.import_batches (space_id, account_id, file_kind, file_sha256, status)
    values (v_c.space_id, v_ref.account_id, 'api', decode(v_ref.digest_hex, 'hex'), 'previewed')
    on conflict (space_id, account_id, file_sha256) do nothing
    returning id into v_batch;
    if v_batch is null then
      continue; -- el mismo payload ya se ingirió: nada que hacer
    end if;

    with src as (
      select f.id as ext_id, f.occurred_on, f.kind, f.amount_minor, f.currency,
             nullif(left(f.description, 200), '') as description,
             extensions.digest(convert_to(v_c.id::text || '|' || f.external_ref || '|' || f.id, 'UTF8'), 'sha256') as fp,
             row_number() over (partition by f.id order by f.occurred_on) as dup_in_payload
      from jsonb_to_recordset(v_flows) as f(external_ref text, id text, occurred_on date, kind text, amount_minor bigint, currency text, description text)
      where f.external_ref = v_ref.external_ref
    ), classified as (
      select s.*, row_number() over (order by s.ext_id) - 1 as row_index,
             case when s.dup_in_payload > 1 or exists (
               select 1 from public.import_rows k
               where k.space_id = v_c.space_id and k.account_id = v_ref.account_id and k.fingerprint = s.fp and k.status = 'imported')
             then 'duplicate' else 'new' end as cls
      from src s
    ), rows_in as (
      insert into public.import_rows (batch_id, space_id, account_id, row_index, fingerprint, status)
      select v_batch, v_c.space_id, v_ref.account_id, cl.row_index::integer, cl.fp, cl.cls from classified cl
      returning 1
    )
    select count(*) filter (where cls = 'new'), count(*) filter (where cls = 'duplicate')
      into v_added, v_dup from classified;
    v_new := v_new + v_added;

    -- Los nuevos se convierten en movimientos con sus dos patas (efectivo y externa).
    with todo as (
      select r.id as row_id, r.fingerprint, gen_random_uuid() as tx_id
      from public.import_rows r where r.batch_id = v_batch and r.space_id = v_c.space_id and r.status = 'new'
    ), pairs as (
      -- DISTINCT ON: un identificador repetido en el payload crea un solo movimiento.
      select distinct on (t.row_id) t.row_id, t.tx_id, f.occurred_on, f.kind, f.amount_minor, f.currency, nullif(left(f.description, 200), '') as description
      from todo t
      join jsonb_to_recordset(v_flows) as f(external_ref text, id text, occurred_on date, kind text, amount_minor bigint, currency text, description text)
        on f.external_ref = v_ref.external_ref
       and extensions.digest(convert_to(v_c.id::text || '|' || f.external_ref || '|' || f.id, 'UTF8'), 'sha256') = t.fingerprint
      order by t.row_id, f.occurred_on
    ), new_tx as (
      insert into public.transactions (id, space_id, kind, occurred_on, description, status, source)
      select p.tx_id, v_c.space_id, p.kind, p.occurred_on, p.description, 'settled', 'api' from pairs p
      returning id
    ), new_legs as (
      insert into public.transaction_legs (transaction_id, space_id, role, account_id, amount_minor, currency)
      select p.tx_id, v_c.space_id, 'cash', v_ref.account_id,
             case when p.kind in ('withdrawal') then -p.amount_minor else p.amount_minor end, p.currency from pairs p
      union all
      select p.tx_id, v_c.space_id, 'external', null,
             case when p.kind in ('withdrawal') then p.amount_minor else -p.amount_minor end, p.currency from pairs p
      returning 1
    )
    update public.import_rows r set status = 'imported', transaction_id = p.tx_id
    from pairs p where r.id = p.row_id;

    update public.import_batches
      set status = 'committed', committed_at = now(),
          row_count = (select count(*) from public.import_rows r where r.batch_id = v_batch and r.space_id = v_c.space_id)
      where id = v_batch;
    v_batch := null;
  end loop;

  -- Valoraciones: la API no pisa un valor que la persona escribió a mano ese día.
  for v_ref in
    select ca.account_id, v.as_of, v.value_minor, v.currency
    from jsonb_to_recordset(v_vals) as v(external_ref text, as_of date, value_minor bigint, currency text)
    join public.connection_accounts ca
      on ca.connection_id = v_c.id and ca.space_id = v_c.space_id and ca.external_ref = v.external_ref
  loop
    insert into public.valuations (space_id, account_id, as_of, value_minor, currency, source)
    values (v_c.space_id, v_ref.account_id, v_ref.as_of, v_ref.value_minor, v_ref.currency, 'api')
    on conflict (account_id, asset_id, as_of) do update
      set value_minor = excluded.value_minor, currency = excluded.currency, source = 'api'
      where public.valuations.source in ('api', 'computed', 'price_feed');
    v_vals_n := v_vals_n + 1;
  end loop;

  update public.connections set last_success_at = now(), last_error_code = null where id = v_c.id;
  perform audit.log_event('connection.synced', 'connection', v_c.id::text, v_c.space_id,
    jsonb_build_object('provider', v_c.provider, 'new', v_new, 'duplicate', v_dup, 'valuations', v_vals_n));
  return jsonb_build_object('new', v_new, 'duplicate', v_dup, 'valuations', v_vals_n);
end;
$$;
comment on function public.ingest_sync is 'Escribe lo que trae una sincronización (movimientos como lote de importación idempotente y valoraciones). Solo service_role; comprueba conexión activa, cuentas vinculadas y moneda.';

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------
revoke execute on function
  public.can_manage_connection(uuid), public.request_sync(uuid), public.revoke_connection(uuid),
  public.put_connection_secret(uuid, bytea, bytea, bytea, bytea, smallint, text),
  public.get_connection_secret(uuid), public.get_connection_info(uuid), public.activate_connection(uuid, timestamptz),
  public.take_rate_tokens(text, numeric, numeric, numeric), public.claim_sync_jobs(integer),
  public.finish_sync_job(bigint, text, text, integer), public.schedule_due_syncs(),
  public.ingest_sync(uuid, jsonb)
from public, anon, authenticated;
grant execute on function
  public.can_manage_connection(uuid), public.request_sync(uuid), public.revoke_connection(uuid)
to authenticated;
grant execute on function
  public.revoke_connection(uuid),
  public.put_connection_secret(uuid, bytea, bytea, bytea, bytea, smallint, text),
  public.get_connection_secret(uuid), public.get_connection_info(uuid), public.activate_connection(uuid, timestamptz),
  public.take_rate_tokens(text, numeric, numeric, numeric), public.claim_sync_jobs(integer),
  public.finish_sync_job(bigint, text, text, integer), public.schedule_due_syncs(),
  public.ingest_sync(uuid, jsonb)
to service_role;
revoke execute on function private.take_tokens(text, numeric, numeric, numeric), private.guard_connection_limit()
from public, anon, authenticated;

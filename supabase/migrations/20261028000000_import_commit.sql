-- =============================================================================
-- Importación de extractos: vista previa, confirmación atómica y reversión (ADR-0008, ADR-0021).
-- Solo aditiva: una columna nueva y cinco funciones. No modifica nada ya aplicado.
-- El flujo: import_preview (clasifica filas) → import_commit (crea todos los movimientos de una
-- vez o ninguno) → import_revert (deshace en 24 h) o import_discard (descarta una vista previa).
-- =============================================================================

-- El saldo inicial que crea una importación se anota para poder deshacerlo con ella.
alter table public.import_batches
  add column opening_transaction_id uuid,
  add foreign key (opening_transaction_id, space_id) references public.transactions (id, space_id) on delete set null (opening_transaction_id);
comment on column public.import_batches.opening_transaction_id is 'Saldo inicial creado por esta importación; se borra al deshacerla.';
create index import_batches_opening_idx on public.import_batches (space_id, opening_transaction_id)
  where opening_transaction_id is not null;

-- ---------------------------------------------------------------------------
-- Vista previa. security definer: escribe en tablas cuyo acceso directo del usuario es solo CRUD
-- por RLS; comprueba permisos de forma explícita y no devuelve datos de otros espacios.
-- p_rows: [{ "row_index": 1, "fingerprint": "<64 hex>", "error_code": null | "row.xxx" }, ...]
-- ---------------------------------------------------------------------------
create function public.import_preview(
  p_space_id uuid, p_account_id uuid, p_file_kind text, p_file_sha256 bytea,
  p_storage_path text, p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_n integer;
  v_new integer;
  v_dup integer;
  v_err integer;
begin
  if not private.can_write(p_space_id) then
    raise exception 'Sin permiso de escritura en el espacio' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_account_id and a.space_id = p_space_id) then
    raise exception 'La cuenta no existe en el espacio' using errcode = 'foreign_key_violation';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'p_rows debe ser un array JSON' using errcode = 'invalid_parameter_value';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n < 1 or v_n > 5000 then
    raise exception 'Un archivo lleva entre 1 y 5000 filas' using errcode = 'invalid_parameter_value';
  end if;

  select b.* into v_batch
  from public.import_batches b
  where b.space_id = p_space_id and b.account_id = p_account_id and b.file_sha256 = p_file_sha256
  for update;
  if found and v_batch.status = 'committed' then
    return jsonb_build_object('status', 'already_imported', 'batch_id', v_batch.id);
  end if;
  if found then
    -- Una vista previa anterior (o una importación deshecha) se rehace desde cero.
    delete from public.import_rows r where r.batch_id = v_batch.id and r.space_id = p_space_id;
    update public.import_batches
      set status = 'previewed', file_kind = p_file_kind, storage_path = p_storage_path,
          original_deleted_at = null, committed_at = null, opening_transaction_id = null
      where id = v_batch.id;
  else
    insert into public.import_batches (space_id, account_id, file_kind, file_sha256, storage_path)
    values (p_space_id, p_account_id, p_file_kind, p_file_sha256, p_storage_path)
    returning * into v_batch;
  end if;

  -- Una fila es duplicada si su huella ya está importada en la cuenta o si se repite antes en el
  -- mismo archivo; una fila con código de error no se importa.
  insert into public.import_rows (batch_id, space_id, account_id, row_index, fingerprint, status, error_code)
  select v_batch.id, p_space_id, p_account_id, x.row_index, decode(x.fingerprint, 'hex'),
         case
           when x.error_code is not null then 'error'
           when x.rn > 1 then 'duplicate'
           when exists (
             select 1 from public.import_rows k
             where k.space_id = p_space_id and k.account_id = p_account_id
               and k.fingerprint = decode(x.fingerprint, 'hex') and k.status = 'imported'
           ) then 'duplicate'
           else 'new'
         end,
         x.error_code
  from (
    select r.row_index, r.fingerprint, r.error_code,
           row_number() over (partition by r.fingerprint order by r.row_index) as rn
    from jsonb_to_recordset(p_rows) as r(row_index integer, fingerprint text, error_code text)
  ) x;

  select count(*) filter (where r.status = 'new'),
         count(*) filter (where r.status = 'duplicate'),
         count(*) filter (where r.status = 'error')
    into v_new, v_dup, v_err
  from public.import_rows r where r.batch_id = v_batch.id and r.space_id = p_space_id;
  update public.import_batches set row_count = v_n where id = v_batch.id;

  return jsonb_build_object('status', 'previewed', 'batch_id', v_batch.id,
                            'new', v_new, 'duplicate', v_dup, 'error', v_err);
end;
$$;
comment on function public.import_preview is 'Registra la vista previa de un archivo: clasifica cada fila (nueva, duplicada, con error) por su huella. El mismo archivo ya confirmado devuelve already_imported.';

-- ---------------------------------------------------------------------------
-- Confirmación atómica. Crea todos los movimientos de las filas nuevas (y, si se pide, un saldo
-- inicial) o ninguno. security definer: es una de las vías de escritura del libro (regla 5).
-- p_transactions: [{ row_index, kind: income|expense, occurred_on, description, legs: [cash, external] }]
-- p_opening: { occurred_on, amount_minor } o nulo.
-- ---------------------------------------------------------------------------
create function public.import_commit(p_batch_id uuid, p_transactions jsonb, p_opening jsonb default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_currency char(3);
  v_n integer;
  v_updated integer;
  v_opening uuid;
  v_opening_amount bigint;
  r record;
  v_cash bigint;
  v_ext bigint;
begin
  select b.* into v_batch from public.import_batches b where b.id = p_batch_id for update;
  if not found or not private.can_write(v_batch.space_id) then
    raise exception 'Importación no encontrada o sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_batch.status <> 'previewed' then
    raise exception 'La importación no está pendiente de confirmar' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_transactions) is distinct from 'array' then
    raise exception 'p_transactions debe ser un array JSON' using errcode = 'invalid_parameter_value';
  end if;
  v_n := jsonb_array_length(p_transactions);
  if v_n > 5000 then
    raise exception 'Una importación lleva como máximo 5000 movimientos' using errcode = 'invalid_parameter_value';
  end if;
  select a.currency into v_currency from public.accounts a
    where a.id = v_batch.account_id and a.space_id = v_batch.space_id;

  -- Cada movimiento: tipo permitido, una pata de efectivo en la cuenta del lote y una externa que
  -- cuadran, y un signo coherente con el tipo. El cliente no puede elegir otras cuentas ni patas.
  for r in
    select t.row_index, t.kind, t.occurred_on, t.legs
    from jsonb_to_recordset(p_transactions) as t(row_index integer, kind text, occurred_on date, description text, legs jsonb)
  loop
    if r.row_index is null or r.occurred_on is null or r.kind is null or r.kind not in ('income', 'expense')
       or jsonb_typeof(r.legs) is distinct from 'array' or jsonb_array_length(r.legs) <> 2 then
      raise exception 'Movimiento de importación no válido (fila %)', r.row_index using errcode = 'invalid_parameter_value';
    end if;
    select sum(l.amount_minor) filter (where l.role = 'cash' and l.account_id = v_batch.account_id and l.currency = v_currency),
           sum(l.amount_minor) filter (where l.role = 'external' and l.account_id is null and l.currency = v_currency),
           count(*) filter (where (l.role = 'cash' and l.account_id = v_batch.account_id)
                              or (l.role = 'external' and l.account_id is null))
      into v_cash, v_ext, v_n
    from jsonb_to_recordset(r.legs) as l(role text, account_id uuid, amount_minor bigint, currency text);
    if v_n <> 2 or v_cash is null or v_ext is null or v_cash = 0 or v_cash + v_ext <> 0
       or (r.kind = 'income' and v_cash < 0) or (r.kind = 'expense' and v_cash > 0) then
      raise exception 'Patas de importación no válidas (fila %)', r.row_index using errcode = 'invalid_parameter_value';
    end if;
  end loop;
  v_n := jsonb_array_length(p_transactions);

  if p_opening is not null then
    if exists (
      select 1 from public.transactions t
      join public.transaction_legs l on l.transaction_id = t.id and l.space_id = t.space_id
      where t.space_id = v_batch.space_id and t.kind = 'opening_balance'
        and l.role = 'cash' and l.account_id = v_batch.account_id
    ) then
      raise exception 'La cuenta ya tiene un saldo inicial' using errcode = 'check_violation';
    end if;
    v_opening_amount := (p_opening ->> 'amount_minor')::bigint;
    if v_opening_amount is null or v_opening_amount = 0 or (p_opening ->> 'occurred_on')::date is null then
      raise exception 'Saldo inicial no válido' using errcode = 'invalid_parameter_value';
    end if;
    v_opening := gen_random_uuid();
    insert into public.transactions (id, space_id, kind, occurred_on, description, status, source, entered_by)
    values (v_opening, v_batch.space_id, 'opening_balance', (p_opening ->> 'occurred_on')::date,
            'Saldo inicial del extracto', 'settled', 'csv', (select auth.uid()));
    insert into public.transaction_legs (transaction_id, space_id, role, account_id, amount_minor, currency)
    values (v_opening, v_batch.space_id, 'cash', v_batch.account_id, v_opening_amount, v_currency),
           (v_opening, v_batch.space_id, 'external', null, -v_opening_amount, v_currency);
  end if;

  -- Todo de una vez. Las patas se validan al final de la transacción (cuadre por moneda, etc.).
  with src as (
    select t.row_index, t.kind, t.occurred_on, nullif(left(t.description, 200), '') as description, t.legs,
           gen_random_uuid() as tx_id
    from jsonb_to_recordset(p_transactions) as t(row_index integer, kind text, occurred_on date, description text, legs jsonb)
  ), new_tx as (
    insert into public.transactions (id, space_id, kind, occurred_on, description, status, source, entered_by)
    select s.tx_id, v_batch.space_id, s.kind, s.occurred_on, s.description, 'settled', 'csv', (select auth.uid())
    from src s
    returning id
  ), new_legs as (
    insert into public.transaction_legs (transaction_id, space_id, role, account_id, amount_minor, currency)
    select s.tx_id, v_batch.space_id, l.role, l.account_id, l.amount_minor, l.currency
    from src s
    cross join lateral jsonb_to_recordset(s.legs) as l(role text, account_id uuid, amount_minor bigint, currency text)
    returning 1
  )
  update public.import_rows ir
    set status = 'imported', transaction_id = s.tx_id
  from src s
  where ir.batch_id = v_batch.id and ir.space_id = v_batch.space_id
    and ir.row_index = s.row_index and ir.status = 'new';
  get diagnostics v_updated = row_count;
  if v_updated <> v_n then
    -- Alguna fila no existe, ya estaba importada, es duplicada o tiene error: no se importa nada.
    raise exception 'Alguna fila no está pendiente de importar' using errcode = 'check_violation';
  end if;

  update public.import_batches
    set status = 'committed', committed_at = now(), opening_transaction_id = v_opening
    where id = v_batch.id;
  perform audit.log_event('import.committed', 'import_batch', v_batch.id::text, v_batch.space_id,
    jsonb_build_object('rows', v_n, 'opening', v_opening is not null));
  return jsonb_build_object('batch_id', v_batch.id, 'imported', v_n, 'opening', v_opening is not null);
end;
$$;
comment on function public.import_commit is 'Confirma una vista previa: crea los movimientos (ingreso o gasto sin categoría) de las filas nuevas y, si se pide, un saldo inicial; todo o nada.';

-- ---------------------------------------------------------------------------
-- Deshacer una importación confirmada (solo en las 24 h siguientes, como delete_transaction).
-- Borra sus movimientos y libera las huellas para poder volver a importarla.
-- ---------------------------------------------------------------------------
create function public.import_revert(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_tx uuid[];
begin
  select b.* into v_batch from public.import_batches b where b.id = p_batch_id for update;
  if not found or not private.can_write(v_batch.space_id) then
    raise exception 'Importación no encontrada o sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_batch.status <> 'committed' then
    raise exception 'La importación no está confirmada' using errcode = 'check_violation';
  end if;
  if v_batch.committed_at < now() - interval '24 hours' then
    raise exception 'Solo se deshace una importación de las últimas 24 h: revierte sus movimientos uno a uno' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(r.transaction_id), '{}') into v_tx
  from public.import_rows r
  where r.batch_id = v_batch.id and r.space_id = v_batch.space_id and r.status = 'imported' and r.transaction_id is not null;
  if v_batch.opening_transaction_id is not null then
    v_tx := v_tx || v_batch.opening_transaction_id;
  end if;
  if exists (select 1 from public.transactions t where t.space_id = v_batch.space_id and t.reverses_id = any (v_tx)) then
    raise exception 'Hay movimientos de esta importación que ya se revirtieron a mano' using errcode = 'check_violation';
  end if;

  update public.import_rows set status = 'new', transaction_id = null
    where batch_id = v_batch.id and space_id = v_batch.space_id and status = 'imported';
  update public.import_batches
    set status = 'reverted', committed_at = null, opening_transaction_id = null
    where id = v_batch.id;
  delete from public.transactions t where t.space_id = v_batch.space_id and t.id = any (v_tx);
  perform audit.log_event('import.reverted', 'import_batch', v_batch.id::text, v_batch.space_id,
    jsonb_build_object('transactions', cardinality(v_tx)));
  return jsonb_build_object('batch_id', v_batch.id, 'removed', cardinality(v_tx));
end;
$$;
comment on function public.import_revert is 'Deshace una importación confirmada hace menos de 24 h: borra sus movimientos y libera sus huellas.';

-- Descarta una vista previa que no se llegó a confirmar. Una importación confirmada no se descarta.
create function public.import_discard(p_batch_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch public.import_batches;
begin
  select b.* into v_batch from public.import_batches b where b.id = p_batch_id for update;
  if not found or not private.can_write(v_batch.space_id) then
    raise exception 'Importación no encontrada o sin permiso' using errcode = 'insufficient_privilege';
  end if;
  if v_batch.status <> 'previewed' then
    raise exception 'Solo se descarta una vista previa sin confirmar' using errcode = 'check_violation';
  end if;
  delete from public.import_batches where id = v_batch.id;
end;
$$;
comment on function public.import_discard is 'Descarta una vista previa sin confirmar (sus filas se borran en cascada).';

-- ---------------------------------------------------------------------------
-- Fecha del último apunte de efectivo de cada cuenta: permite elegir lo más reciente entre una
-- valoración manual y el saldo de los movimientos. Aditiva: no cambia account_cash_balances.
-- ---------------------------------------------------------------------------
create function public.account_last_activity(p_space_id uuid, p_on date default null)
returns table (account_id uuid, last_on date)
language sql stable set search_path = ''
as $$
  select l.account_id, max(t.occurred_on)
  from public.transaction_legs l
  join public.transactions t on t.id = l.transaction_id and t.space_id = l.space_id
  where l.space_id = p_space_id and l.role = 'cash'
    and (p_on is null or t.occurred_on <= p_on)
    and t.status = 'settled'
  group by l.account_id;
$$;
comment on function public.account_last_activity is 'Fecha del último movimiento liquidado de efectivo por cuenta (hasta p_on).';

revoke execute on function
  public.import_preview(uuid, uuid, text, bytea, text, jsonb),
  public.import_commit(uuid, jsonb, jsonb),
  public.import_revert(uuid),
  public.import_discard(uuid),
  public.account_last_activity(uuid, date)
from public, anon;
grant execute on function
  public.import_preview(uuid, uuid, text, bytea, text, jsonb),
  public.import_commit(uuid, jsonb, jsonb),
  public.import_revert(uuid),
  public.import_discard(uuid),
  public.account_last_activity(uuid, date)
to authenticated;

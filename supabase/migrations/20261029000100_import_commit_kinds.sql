-- =============================================================================
-- Importación de extractos de brókeres y exchanges: import_commit admite también aportaciones,
-- retiradas, dividendos e intereses (ADR-0008, ADR-0021). Aditiva y compatible hacia atrás: los
-- tipos income y expense siguen igual (con la categoría opcional y el reembolso de
-- 20261029000000_import_categories, que esta versión conserva); solo se amplía la lista de tipos.
-- Va DESPUÉS de la de categorías: reemplaza la misma función y debe incluir ambas.
--
-- Cada movimiento sigue llevando una pata de efectivo en la cuenta del lote y una externa que
-- cuadran (regla 16): la aportación y el dividendo/interés entran (+), la retirada y el gasto
-- salen (−). Una compra o venta NO se importa aquí: no cruza el borde del espacio (ADR-0006).
-- =============================================================================

create or replace function public.import_commit(p_batch_id uuid, p_transactions jsonb, p_opening jsonb default null)
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
  v_bad integer;
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
    if r.row_index is null or r.occurred_on is null or r.kind is null or r.kind not in ('income', 'expense', 'contribution', 'withdrawal', 'dividend', 'interest')
       or jsonb_typeof(r.legs) is distinct from 'array' or jsonb_array_length(r.legs) <> 2 then
      raise exception 'Movimiento de importación no válido (fila %)', r.row_index using errcode = 'invalid_parameter_value';
    end if;
    -- Una categoría solo puede ir en la pata externa y debe ser del espacio, del mismo tipo que el
    -- movimiento y no estar archivada: el cliente no elige categorías de otros espacios.
    select sum(l.amount_minor) filter (where l.role = 'cash' and l.account_id = v_batch.account_id and l.currency = v_currency),
           sum(l.amount_minor) filter (where l.role = 'external' and l.account_id is null and l.currency = v_currency),
           count(*) filter (where (l.role = 'cash' and l.account_id = v_batch.account_id)
                              or (l.role = 'external' and l.account_id is null)),
           count(*) filter (where l.category_id is not null and (l.role <> 'external' or c.id is null))
      into v_cash, v_ext, v_n, v_bad
    from jsonb_to_recordset(r.legs) as l(role text, account_id uuid, category_id uuid, amount_minor bigint, currency text)
    left join public.categories c on c.id = l.category_id and c.space_id = v_batch.space_id
      and c.kind = r.kind and c.archived_at is null;
    -- Un gasto con importe positivo en el efectivo es un reembolso y resta de su categoría.
    if v_n <> 2 or v_bad <> 0 or v_cash is null or v_ext is null or v_cash = 0 or v_cash + v_ext <> 0
       or (r.kind in ('income', 'contribution', 'dividend', 'interest') and v_cash < 0)
       or (r.kind = 'withdrawal' and v_cash > 0) then
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
    insert into public.transaction_legs (transaction_id, space_id, role, account_id, category_id, amount_minor, currency)
    select s.tx_id, v_batch.space_id, l.role, l.account_id, l.category_id, l.amount_minor, l.currency
    from src s
    cross join lateral jsonb_to_recordset(s.legs) as l(role text, account_id uuid, category_id uuid, amount_minor bigint, currency text)
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
comment on function public.import_commit is 'Confirma una vista previa: crea los movimientos de ingreso, gasto, aportación, retirada, dividendo o interés (con categoría opcional en la pata externa; un gasto positivo es un reembolso) de las filas nuevas y, si se pide, un saldo inicial; todo o nada.';

revoke execute on function public.import_commit(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.import_commit(uuid, jsonb, jsonb) to authenticated;

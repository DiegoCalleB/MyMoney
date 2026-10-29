-- =============================================================================
-- «Ya lo reconozco» (ADR-0021): marca de que la persona ha revisado un cargo que la detección
-- de cargos inusuales había señalado, para que deje de aparecer. Solo guarda una referencia al
-- movimiento y la regla; nunca importes ni descripciones.
-- =============================================================================
create table public.reviewed_movements (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  transaction_id uuid not null,
  rule_id text not null check (rule_id in ('possible_duplicate', 'recurring_change', 'unusual_amount')),
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, space_id),
  unique (space_id, transaction_id, rule_id),
  foreign key (transaction_id, space_id) references public.transactions (id, space_id) on delete cascade
);
comment on table public.reviewed_movements is 'Cargos señalados por la detección de cargos inusuales que la persona ya ha revisado. No guarda importes. [financiero]';
comment on column public.reviewed_movements.rule_id is 'Regla que lo señaló: possible_duplicate, recurring_change o unusual_amount.';
comment on column public.reviewed_movements.entered_by is 'Quién lo marcó como revisado (lo fija un trigger con el usuario autenticado). [pii]';
create index reviewed_movements_entered_by_idx on public.reviewed_movements (entered_by) where entered_by is not null;
create trigger reviewed_movements_entered_by before insert on public.reviewed_movements
  for each row execute function private.set_entered_by();

-- Se marca y se desmarca (insertar y borrar); nunca se edita.
select private.secure_space_table('reviewed_movements');
revoke update on public.reviewed_movements from authenticated;

-- =============================================================================
-- Producto de una cuenta (ADR-0023): «un fondo = una cuenta = un producto». Permite declarar la
-- composición (región, clase de activo…) de lo que hay en una cuenta sin duplicar conceptos
-- (ADR-0018): la composición sigue colgando del activo, y la cuenta apunta a su activo principal.
-- Aditiva: una columna opcional con clave foránea compuesta por espacio.
-- =============================================================================
alter table public.accounts add column primary_asset_id uuid;
alter table public.accounts add constraint accounts_primary_asset_fk
  foreign key (primary_asset_id, space_id) references public.assets (id, space_id)
  on delete set null (primary_asset_id);
comment on column public.accounts.primary_asset_id is 'Activo (producto) que representa lo que contiene la cuenta, para declarar su composición. Opcional: una cuenta con varias posiciones no lo usa.';
create index accounts_primary_asset_idx on public.accounts (space_id, primary_asset_id) where primary_asset_id is not null;
grant update (primary_asset_id) on public.accounts to authenticated;

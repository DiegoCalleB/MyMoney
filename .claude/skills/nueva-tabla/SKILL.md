---
name: nueva-tabla
description: Crea una tabla nueva de MyMoney en Supabase con RLS forzada, permisos mínimos, comentarios de datos personales y sus tests pgTAP. Úsala siempre que haya que añadir o cambiar una tabla, columna o política.
---

# Nueva tabla con RLS y tests

Sigue `CLAUDE.md` (reglas 1-3) y `docs/plan/04-modelo-datos.md`. Una tabla sin tests de RLS no se fusiona.

## Pasos

1. **Migración** en `supabase/migrations/<AAAAMMDDHHMMSS>_<nombre>.sql` (nunca edites una migración ya aplicada; crea otra):
   - Columna `space_id uuid not null references public.spaces (id) on delete cascade` (salvo tablas del usuario o de `ref`).
   - Dinero: `amount_minor bigint` + `currency char(3) references ref.currencies (code)`. Cantidades `numeric(38,12)`, precios `numeric(28,10)`. Fechas contables `date`.
   - `comment on table/column` con etiquetas `[pii]`, `[financiero]`, `[menor]` cuando aplique.
   - Índice que empiece por `space_id`.
   - `alter table … enable row level security;` **y** `force row level security;`
   - Políticas con `private.can_read(space_id)`, `private.can_write(space_id)`, `private.is_owner(space_id)`; añade `private.meets_sensitive_aal()` en acciones sensibles. Nada `to anon`.
   - `revoke all … from public, anon, authenticated;` y después `grant` solo de las columnas y operaciones necesarias.
   - Funciones: `set search_path = ''`, nombres cualificados; `security definer` solo si es imprescindible y con un comentario que lo justifique.
2. **Tests pgTAP** en `supabase/tests/0NN-<tabla>.sql` usando `tests.create_user`, `tests.authenticate_as`, `tests.as_anon` y `tests.as_postgres` (ver `000-setup-test-helpers.sql`). Como mínimo:
   - un usuario de otro espacio no lee, inserta, modifica ni borra (ni conociendo el `id`);
   - cada rol (`owner`, `editor`, `viewer`, `advisor` vigente y caducado) puede exactamente lo de la matriz RLS;
   - `insert` con `space_id` ajeno falla y `update` que cambia `space_id` no afecta a filas;
   - invariantes propios de la tabla (cuadre, sumas, checks).
3. **Ejecuta** `pnpm test:db`. El meta-test `001-rls-coverage.sql` debe seguir en verde.
4. **Comprueba que el test detecta fallos**: relaja temporalmente una política (por ejemplo `using (true)`), confirma que algún test falla y restaura.
5. **Actualiza** la matriz RLS de `docs/plan/04-modelo-datos.md` si cambian los permisos.
6. Tras aplicarla en Supabase, revisa los avisos de seguridad (*Security Advisor*).

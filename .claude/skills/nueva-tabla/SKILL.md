---
name: nueva-tabla
description: Crea o modifica una tabla de MyMoney en Supabase con RLS forzada, claves compuestas por espacio, permisos mínimos, comentarios de datos personales y tests pgTAP. Úsala siempre que haya que añadir o cambiar una tabla, columna, índice o política.
---

# Nueva tabla con RLS y tests

Contexto: `AGENTS.md` (reglas 1-5), ADR-0004 y `docs/plan/15-revision-bd.md`. Una tabla sin tests no se fusiona. Nunca edites una migración ya aplicada en un entorno remoto: crea otra.

## Pasos

1. **Migración** en `supabase/migrations/<AAAAMMDDHHMMSS>_<nombre>.sql`:
   - `space_id uuid not null references public.spaces (id) on delete cascade` (salvo tablas del usuario o de `ref`).
   - `unique (id, space_id)` en la tabla, para que otras puedan apuntarle con clave compuesta.
   - **Toda FK hacia otra tabla con `space_id` es compuesta**: `foreign key (account_id, space_id) references public.accounts (id, space_id)`. Así es imposible referenciar datos de otro espacio. Ponle un índice cuyas primeras columnas sean las de la FK.
   - Dinero: `amount_minor bigint` con límite (`abs() <= 10^15`) + `currency char(3) references ref.currencies (code)`. Cantidades `numeric(38,12)`, precios `numeric(28,10)`, porcentajes en puntos básicos (`integer`). Fechas contables `date`.
   - Textos con `check (char_length(...) <= N)`; `jsonb` solo con `check (jsonb_typeof(...) = 'object')` y tamaño acotado. Enumeraciones como `text` + `check`.
   - `comment on table/column` con `[pii]`, `[financiero]`, `[menor]` cuando aplique.
   - `enable` **y** `force row level security`. Políticas con los arrays de `private`: `space_id = any ((select private.readable_space_ids()))` (lectura), `writable_space_ids()` (escritura), `owned_space_ids()` (propietarios), `peer_space_ids()` (sin asesores). Envuelve siempre en `(select ...)` para que se evalúe una vez por consulta. Nada `to anon`.
   - `revoke all ... from public, anon, authenticated` y concede solo lo necesario; `update` por columnas, sin `id`, `space_id` ni `created_at`.
   - Si la tabla tiene invariantes (sumas, cuadre, estados), impónlos con *constraint triggers* diferidos o con RPC, no solo en la aplicación.
   - Funciones: `set search_path = ''`, nombres cualificados; `security definer` solo con comentario que lo justifique y comprobación explícita de permisos.
2. **Registra la tabla** en las listas del bucle de políticas de la migración (o escribe sus políticas a mano) y en el fixture de `supabase/tests/080-generic-isolation.sql`.
3. **Tests pgTAP** `supabase/tests/NNN-<tabla>.sql` con `tests.create_user`, `tests.authenticate_as`, `tests.as_anon`, `tests.as_postgres`: aislamiento entre espacios, permisos por rol (`owner`, `editor`, `viewer`, `advisor` vigente y caducado), `space_id` inmutable, invariantes propios.
4. `pnpm test:db`. Los tests genéricos (`001`, `050`, `080`) deben seguir en verde: comprueban RLS forzada, FKs compuestas, índices de FKs, vistas `security_invoker` y aislamiento en **todas** las tablas.
5. **Comprueba que los tests detectan fallos**: relaja una política (`using (true)`), confirma que algún test falla y restaura.
6. Actualiza la matriz RLS de `docs/plan/04-modelo-datos.md`. Tras aplicarla en Supabase, revisa los avisos de seguridad y rendimiento del proyecto.

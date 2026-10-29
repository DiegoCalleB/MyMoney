# ADR-0024: Trabajador de sincronización con IP de salida fija (Railway)

- Estado: Propuesto (preparado para tu revisión; **no activo**, `AGENTS.md` no se ha modificado)
- Fecha: 2026-10-29

## Contexto
Binance limita por IP y permite restringir una clave a direcciones concretas; las Edge Functions de Supabase no tienen IP de salida fija (ADR-0022, punto 7). Para uso propio basta con las funciones. Al abrir la app a otras personas conviene un proceso con IP fija. La regla 3 de `AGENTS.md` dice hoy que la clave secreta solo se usa en `supabase/functions`.

## Decisión
1. Un servicio `apps/worker` (Node, Railway) ejecuta la misma lógica de `supabase/functions/_shared` (`handleSyncWorker`), que ya recibe `fetch`, reloj y claves maestras por inyección y no depende de Deno.
2. **No usa la clave secreta de Supabase.** Se conecta con un rol de base de datos propio (`sync_worker`, `login`, sin `bypassrls`) que solo puede ejecutar las funciones que hoy exige `service_role`: `claim_sync_jobs`, `finish_sync_job`, `take_rate_tokens`, `get_connection_secret`, `put_connection_secret`, `get_connection_info`, `get_connection_accounts`, `ingest_sync`, `revoke_connection`. Requiere una migración que acepte ese rol en la comprobación `auth.role()` (hoy solo `service_role`) y sus tests pgTAP.
3. Las claves maestras (`VAULT_KEK_V<n>`) y las credenciales del proveedor viven solo en las variables de Railway.
4. Binance se registra con la IP de salida fija del servicio.

## Cambio propuesto en `AGENTS.md` (regla 3), para que lo revises
Texto actual: «La clave secreta de Supabase (o `service_role`) **nunca** se usa en `apps/web`: solo en `supabase/functions`. La web usa la clave publicable y el JWT del usuario.»

Texto propuesto: «La clave secreta de Supabase (o `service_role`) **nunca** se usa en `apps/web` ni en `apps/worker`: solo en `supabase/functions`. `apps/worker` usa un rol de base de datos propio con permisos mínimos (ADR-0024). La web usa la clave publicable y el JWT del usuario.»

## Alternativas consideradas
- Mantener las Edge Functions con un proxy de salida de IP fija: añade un componente de red sin quitar la clave secreta de la función.
- Dar la clave secreta al worker: descartada, amplía el daño de un compromiso del proveedor de alojamiento.

## Consecuencias
- (+) El servicio que habla con terceros no puede leer ni escribir fuera de las funciones permitidas.
- (−) Una migración y un servicio nuevos que auditar; hasta aceptar este ADR no se escribe código del worker.
- Vigilar: que el rol no reciba permisos directos sobre tablas y que los secretos de Railway no se registren en logs.

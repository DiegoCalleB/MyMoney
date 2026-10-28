# Despliegue en Railway

Configuración del servicio web (`apps/web`) en Railway. Se hace en el panel: la configuración por archivo (`railway.json`) está **obsoleta** en Railway (los servicios nuevos no pueden usarla), así que no se versiona. Estos ajustes proceden de la documentación de Railway y de Next.js; comprueba los nombres exactos en el panel.

## Servicio

| Ajuste | Valor |
| --- | --- |
| Source Repo | `DiegoCalleB/MyMoney` |
| Root Directory | **vacío** (monorepo compartido: el `pnpm-lock.yaml` está en la raíz) |
| Branch connected to production | la rama que se despliegue (ver abajo) |
| Builder | Railpack (por defecto). No debe haber `Dockerfile` en la raíz: Railway lo prioriza sobre el constructor elegido |
| Build Command | `pnpm --filter @mymoney/web build` |
| Start Command | `pnpm --filter @mymoney/web start` |
| Healthcheck Path | `/api/health` |
| Region | EU West (Ámsterdam) |
| Networking | Generate Domain (o dominio propio) |

`next start` escucha en `0.0.0.0` y lee `PORT`, que pone Railway. La versión de Node sale de `.node-version` (22) y de `engines`; compruébala en el registro de la primera compilación.

## Variables

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase (pública) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publicable `sb_publishable_…` (pública). **Nunca la clave secreta**: la aplicación se niega a arrancar |
| `APP_ORIGIN` | Dirección pública de la web, sin ruta, p. ej. `https://tu-servicio.up.railway.app` |
| `MFA_REQUIRED` | Opcional. Por defecto el segundo factor es **obligatorio**. Con `false`, quien aún no lo haya activado puede entrar sin él (verá un aviso); quien ya lo tenga activado sigue teniendo que verificarlo. Pensado para uso con una sola persona; quítala o ponla en `true` para volver a exigirlo |
| `LOG_PSEUDONYM_SECRET` | Aleatorio de 32 bytes o más (`openssl rand -base64 32`). Solo en Railway |

Orden: primero «Generate Domain», luego `APP_ORIGIN` con esa dirección.

## Supabase (Authentication → URL Configuration)

- Site URL: la dirección pública de la web.
- Redirect URLs: `https://…/**` (se pueden dejar también las de `localhost`).
- Contraseña mínima de 12, TOTP activado y confirmación de correo activada.
- Tras crear tu cuenta, desactivar los registros nuevos.

## Qué rama se despliega

Railway despliega la rama conectada a producción cada vez que se sube un cambio. Si la rama no contiene la aplicación, la compilación falla (la comprobación de salud impide que una versión rota sustituya a la que funciona). Con datos reales en Supabase: cada subida a esa rama llega a producción.

## Precios automáticos de criptoactivos (opcional)

Una Edge Function (`supabase/functions/update-prices`) guarda en `ref.prices` el precio de los criptoactivos que hay en tus cuentas (los activos con `kind = 'crypto'` y `ticker`). Solo lee la API pública de Binance (sin clave). Antes de abrir la app a otras personas, confirma las condiciones de uso de los datos de Binance [A VERIFICAR].

**Nada de esto se hace solo: cada paso lo aplica la persona propietaria** (regla 12; primero en un proyecto de pruebas).

1. Aplicar la migración `20261029010000_price_feed.sql` (crea `crypto_tickers()` y `upsert_ref_prices()`, ejecutables solo por `service_role`).
2. Guardar los secretos de la función (Supabase → Edge Functions → Secrets, o `supabase secrets set`): `PRICE_FEED_SECRET` (aleatorio de 32 bytes o más, `openssl rand -base64 32`). Opcionales: `PRICE_FEED_QUOTE` (`EUR` por defecto) y `BINANCE_API_BASE`. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase; la clave secreta no sale de la función.
3. Desplegar: `supabase functions deploy update-prices`.
4. Programar con `pg_cron` y `pg_net` (cada 6 horas, a un minuto que no sea 0), guardando el secreto y la clave publicable en Vault, no en el SQL. Despliega esta función con `supabase functions deploy update-prices --no-verify-jwt` (se autentica con `x-cron-secret`):

   ```sql
   select cron.schedule('update-prices', '17 */6 * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/update-prices',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'price_feed_secret')),
       body := '{}'::jsonb);
   $$);
   ```

5. Comprobar con una llamada manual: la respuesta solo lleva contadores (`updated`, `rejected`, `symbols`).

Los límites de Binance son por IP, no por usuario: una petición cada 6 horas, con hasta 100 símbolos, queda muy por debajo.

## Conexiones automáticas (Binance) — opcional

Lo construido sigue el [ADR-0022](adr/0022-conexiones-automaticas.md) y el capítulo 16 del plan. **Nada de esto se hace solo: cada paso lo aplica la persona propietaria** (regla 12; primero en un proyecto de pruebas). Hasta que no se haga, la pantalla «Conexiones automáticas» de la web no encuentra las tablas y no debe enseñarse.

1. **Migraciones** (en este orden): `20261029000000_import_commit_kinds.sql`, `20261029010000_price_feed.sql`, `20261029020000_income_events.sql` y `20261029030000_connections.sql`. Todas son aditivas. Antes: `pnpm test:db` en verde.
2. **Clave maestra de la bóveda** (la que cifra las credenciales; **no la guardes en la base de datos ni en el repositorio**). Genera una de 32 bytes: `openssl rand -base64 32`. Guárdala en tu gestor de contraseñas **y** como secreto de las dos funciones:
   - `VAULT_KEK_V1` = el valor generado, `VAULT_KEK_CURRENT` = `1`.
   - Si la pierdes, las conexiones no se pueden descifrar y hay que volver a conectarlas (no se pierden datos ya importados).
   - Para rotarla: añade `VAULT_KEK_V2`, cambia `VAULT_KEK_CURRENT` a `2` y conserva la `V1` hasta volver a cifrar.
3. **Secretos de las funciones** (`supabase secrets set`): `SYNC_WORKER_SECRET` (aleatorio, 32 bytes o más). Opcionales: `SYNC_QUOTE` (`EUR`), `SYNC_MAX_JOBS` (`5`), `BINANCE_API_BASE`. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase; la clave secreta no sale de las funciones.
4. **Desplegar**: `supabase functions deploy connect-binance` y `supabase functions deploy sync-worker --no-verify-jwt`.
   - `sync-worker` (y `update-prices`) se autentican con el secreto compartido de la cabecera `x-cron-secret`, no con un JWT: con las claves publicables nuevas la pasarela de Supabase no valida ese encabezado como JWT [A VERIFICAR en tu proyecto], de ahí `--no-verify-jwt`. Sin el secreto correcto responden 401 sin tocar nada.
   - `connect-binance` recibe el JWT de la persona. Si tu proyecto usa claves de firma asimétricas y la pasarela lo rechazara, despliégala también con `--no-verify-jwt`: la función vuelve a comprobar el JWT con la base de datos (`can_manage_connection`, con RLS y segundo factor), así que no pierde protección.
5. **Programar con `pg_cron` y `pg_net`**, con los secretos en Vault (no en el SQL):

   ```sql
   -- Reparte la sincronización diaria de cada conexión (cada 5 minutos).
   select cron.schedule('schedule-syncs', '*/5 * * * *', $$ select public.schedule_due_syncs(); $$);

   -- Procesa la cola (cada minuto).
   select cron.schedule('sync-worker', '* * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-worker',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
         'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_worker_secret')),
       body := '{}'::jsonb);
   $$);
   ```

6. **IP fija (opcional, recomendado en el SaaS).** Binance permite restringir una clave a direcciones IP, pero las Edge Functions de Supabase no tienen IP de salida fija. Para una sola persona basta sin restricción de IP, con la clave de solo lectura (Binance puede desactivar claves sin IP tras un periodo sin usar [A VERIFICAR]; la sincronización diaria la mantiene en uso). Para el SaaS: un proxy de salida con IP fija o el trabajador en Railway (ADR-0022, punto 7, que exige cambiar la regla 3 de `AGENTS.md`).
7. **Límites.** Una sincronización diaria por conexión, «Sincronizar ahora» limitado a una cada 15 minutos, y un cubo de fichas global por proveedor (la mitad del peso por minuto publicado por Binance [A VERIFICAR la cifra]).

**Qué no está probado contra el servicio real.** Los nombres de campo de la API de Binance salen de su documentación pública y se validan de forma estricta con datos inventados [A VERIFICAR contra la API real]. Primera prueba real: conecta con una clave de solo lectura, pulsa «Sincronizar ahora» y comprueba el saldo y los depósitos de los últimos 89 días.

## Parámetros fiscales de la pantalla «Impuestos» (opcional)

La pantalla de impuestos no lleva ninguna cifra legal en el código (regla del proyecto): lee de `ref.tax_parameters` (visible para los usuarios mediante la vista `tax_parameters`, que solo escribe el servidor). Mientras no cargues el parámetro del ejercicio, la pantalla lo dice y no calcula. **Las cifras las pones tú, copiadas de la fuente oficial (BOE, AEAT) y con la fecha en que las comprobaste.** Aplícalo con la clave secreta o desde el editor SQL de Supabase, en staging primero.

```sql
-- Límite anual de aportación a planes de pensiones (importe en céntimos).
insert into ref.tax_parameters (country, fiscal_year, key, value, source_url, verified_on, note)
values ('ES', 2026, 'pension_individual_limit',
        '{"amount_minor": <CÉNTIMOS>, "currency": "EUR"}'::jsonb,
        '<URL OFICIAL>', '<AAAA-MM-DD en que lo comprobaste>', '<nota opcional>');

-- Escala de la base del ahorro: tramos de menor a mayor; el último, sin límite (null).
-- Los tipos van como texto entre comillas ("0.19"), nunca como número.
insert into ref.tax_parameters (country, fiscal_year, key, value, source_url, verified_on)
values ('ES', 2026, 'savings_brackets',
        '{"currency": "EUR", "brackets": [
           {"up_to_minor": <CÉNTIMOS DEL PRIMER TRAMO>, "rate": "<TIPO>"},
           {"up_to_minor": null, "rate": "<TIPO DEL ÚLTIMO TRAMO>"}]}'::jsonb,
        '<URL OFICIAL>', '<AAAA-MM-DD>');
```

Cada cifra mostrada en la web enseña el ejercicio, la fecha de verificación y el enlace a la fuente. Lo que el programa estima (por ejemplo, la ganancia a nivel de cuenta) aparece como estimación con sus supuestos.

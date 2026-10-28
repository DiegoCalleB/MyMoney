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
4. Programar con `pg_cron` y `pg_net` (cada 6 horas, a un minuto que no sea 0), guardando el secreto y la clave publicable en Vault, no en el SQL:

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

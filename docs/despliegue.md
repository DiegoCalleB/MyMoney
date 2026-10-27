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

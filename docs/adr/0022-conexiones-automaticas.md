# ADR-0022: Conexiones automáticas (PSD2 y APIs) como lotes de importación

- Estado: Aceptado en lo que afecta a uso propio (el punto 7 y la regla 3 siguen pendientes)
- Fecha: 2026-10-28

## Contexto
La persona propietaria quiere conectar sus entidades automáticamente y que el diseño sirva después para miles de usuarios. El plan dejaba PSD2 para la fase 3 (HU-53) y Binance por API también para la fase 3. Hechos nuevos (detalle y fuentes en `docs/plan/16-integraciones.md`):
- GoCardless Bank Account Data no admite altas nuevas desde julio de 2025.
- PSD2 solo cubre cuentas de pago; los fondos y planes de pensiones quedan fuera y FiDA no tiene fecha.
- Binance limita por IP y recomienda lista blanca de IP; las Edge Functions no tienen IP de salida fija.
- Los tests de BD corren en un Postgres efímero sin Docker ni `pgmq`.

## Decisión
1. **Agregador PSD2: Enable Banking**, en producción restringida (solo cuentas propias) mientras la app sea de uso propio.
2. **Una conexión** (`connections`) es solo un origen automático (`psd2` o `api`). CSV y manual siguen como están.
3. **Cada sincronización es un lote de importación** (`import_batches.file_kind = 'api'`) con la huella del identificador del proveedor (ADR-0008). Se escribe solo con `private.ingest_sync`, `security definer`, ejecutable solo por el rol del worker y con comprobación de que cada cuenta pertenece a la conexión. La regla 5 se mantiene.
4. **Cola en una tabla** (`private.sync_jobs`) con `FOR UPDATE SKIP LOCKED` y un trabajo vivo por conexión; **cubo de fichas** en `private.rate_buckets`.
5. **Secretos con cifrado de sobre**: AES-256-GCM con una DEK por secreto y la KEK fuera de la base de datos (secreto del worker; después, KMS UE), con versión. La AAD liga el texto cifrado a su espacio y conexión.
6. **Binance con clave Ed25519 autogenerada**: el servidor genera el par y el usuario solo registra la clave pública. Se rechazan las claves con permiso de operar o retirar.
7. **Worker**: Edge Function en uso propio. Al abrir a otras personas, `apps/worker` en Railway con IP de salida fija y un rol de base de datos propio sin la clave secreta. **Esto exige modificar la regla 3 de `AGENTS.md` cuando se acepte esta parte**; hasta entonces sigue vigente tal cual.

## Estado de la implementación (2026-10-29)
- **Hecho y probado** (pgTAP, Vitest, cobertura 100 % en las funciones): tablas `connections` y `connection_accounts` con RLS y claves compuestas; bóveda con cifrado de sobre (AES-256-GCM, AAD por fila, clave maestra con versión fuera de la base de datos); cola con `SKIP LOCKED`, cubo de fichas, reintentos con retroceso; `ingest_sync` como única vía de escritura; Edge Functions `connect-binance` (dos pasos, clave Ed25519 generada en el servidor, rechazo y revocación de claves con permisos de más), `connect-bank` (PSD2 con Enable Banking: bancos, inicio con `state` cifrado en la bóveda, cierre y cuentas sin IBAN) y `sync-worker` (Binance y PSD2, con cubo de fichas por conexión y global); pantallas de la web (`/conexiones`, `/conexiones/binance`, `/conexiones/banco`, `/conexiones/retorno`); lector `.xlsx` y plantilla de eToro (ADR-0023 para la exposición). Conectar o revocar exige AAL2 si hay MFA (`can_manage_connection`).
- **Pendiente** (necesita datos o decisiones de la persona propietaria): contraste de los nombres de campo de Binance con la API real; prueba real de Enable Banking (aplicación registrada, sandbox y cobertura de ING, MyInvestor y Trade Republic; contrato, EIPD y dictamen para terceros); API de eToro (el extracto `.xlsx` ya se lee); el trabajador en Railway y el cambio de la regla 3.
- La regla 3 de `AGENTS.md` **no se ha cambiado**: la clave secreta solo se usa en `supabase/functions`.

## Alternativas consideradas
- **GoCardless**: cerrado a altas nuevas.
- **TrueLayer, Tink, Salt Edge**: sin opción gratuita para uso propio conocida; se pedirá oferta si Enable Banking no cubre alguna entidad.
- **`pgmq`**: no se puede probar en el entorno de tests actual; se puede adoptar después sin cambiar el contrato de trabajos.
- **Supabase Vault para los secretos**: más sencillo, pero descifra dentro de la misma base de datos; una cuenta de base de datos comprometida bastaría.
- **Pedir clave y secreto HMAC de Binance**: el secreto pasaría por el navegador y el portapapeles del usuario.
- **Conectores no oficiales** (Trade Republic): piden credenciales de acceso y rompen condiciones de servicio.

## Consecuencias
- (+) Sin duplicados al reintentar; una sincronización errónea se deshace con `import_revert`; la procedencia de cada cifra se ve igual que en una importación.
- (+) Una copia de la base de datos no expone credenciales utilizables.
- (−) `ingest_sync` es una función `security definer` más que auditar; se cubre con tests pgTAP de pertenencia y de rol.
- (−) Abrir PSD2 a terceros necesita contrato con el agregador, KYB, EIPD específica y dictamen legal (capítulo 7); hasta entonces solo cuentas propias.
- Vigilar: cobertura real de ING España, MyInvestor y Trade Republic en Enable Banking; política de Binance para claves sin IP; alcance de lectura de la API de eToro.

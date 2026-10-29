# 17. Estado de las integraciones y de las funciones tipo Getquin (2026-10-29)

> Qué se ha construido, cómo se ha comprobado, qué hallazgos dio la revisión de seguridad y qué queda **bloqueado a la espera de datos o decisiones de la persona propietaria**. Plan de partida: [16-integraciones.md](16-integraciones.md) y [ADR-0022](../adr/0022-conexiones-automaticas.md). Nada de lo construido se ha aplicado a ningún proyecto de Supabase (regla 12): los pasos para hacerlo están en [`../despliegue.md`](../despliegue.md).

## 1. Qué hay construido

| Paso | Qué | Dónde | Comprobación |
|------|-----|-------|--------------|
| 3 | Pantalla **Importar**: subir CSV, vista previa (nuevas, duplicadas, con error), confirmar todo o nada, descartar y deshacer en 24 h | `apps/web/.../importar`, `app/actions/imports.ts`, `packages/importers/src/payloads.ts` | Vitest (100 % en `importers`); el original vive en el bucket privado y se borra al confirmar; se verifica su huella antes de confirmar |
| 4-5 | Plantillas **Trade Republic**, **Binance** y **eToro** (datos declarativos; cabecera exacta o no se aplican); lector `.xlsx` propio sin dependencias y con límites antibomba (`packages/importers/src/xlsx.ts`); `import_commit` admite aportaciones, retiradas, dividendos e intereses | `packages/importers/src/templates.ts`, `entities.ts`, `entidades/*.md`, migración `…29000000` | Vitest + pgTAP `099`. **Sin verificar con un archivo real** (la interfaz lo avisa) |
| 6 | **Precios automáticos** de criptoactivos | `supabase/functions/update-prices`, migración `…29010000` | Vitest + pgTAP `101`. Sin desplegar |
| 7 | **Exposición real** (mirar dentro de los fondos): se declara la composición de la cuenta (ADR-0023, «un fondo = una cuenta = un producto») y se ve la suma por clase de activo, región y sector | `finance-core/src/exposure.ts`, `/exposicion`, migración `…29040000` | Ejemplos + propiedades (clasificado + sin clasificar = total); pgTAP `104` |
| 8 | **Cobros**: calendario mensual de dividendos e intereses, total del año, rentabilidad por cobros y estimación explícita | `finance-core/src/income.ts`, `/cobros`, migración `…29020000` | Vitest + pgTAP `102`; los movimientos manuales admiten dividendo e interés |
| 9 | **Cuenta frente a una referencia** con las mismas aportaciones y retiradas | `finance-core/src/benchmark.ts`, `/referencia` | Ejemplos + propiedades. Necesita historial de precios (hoy solo el de cripto) |
| 10 | Avisos de **tope especulativo** (umbral editable, 5 % de partida) y de **operaciones planificadas vencidas** | `finance-core/src/advice.ts` | Vitest 100 %; guardián de textos ampliado a `income.`, `benchmark.` y `tax.` |
| 11-13 | **Conexiones automáticas**: tablas con RLS, bóveda (AES-256-GCM, clave maestra fuera de la base de datos, AAD por fila), cola con `SKIP LOCKED`, cubo de fichas, `ingest_sync`, Binance con clave **Ed25519 generada en el servidor**, rechazo y revocación de claves con permisos de más, AAL2 | migración `…29030000`, `supabase/functions/*`, `/conexiones` | pgTAP `103` (111 pruebas) y Vitest (116 en las funciones, 100 %) |
| 15 | **Impuestos informativos**: margen del plan de pensiones y traspaso frente a venta, **sin cifras legales en el código** (salen de `tax_parameters` con fuente y fecha) | `finance-core/src/tax.ts`, `/fiscal` | Ejemplos + propiedades; una propiedad detectó un error de enfoque (comparar comisiones absolutas) y se corrigió |
| 14 | **Conexión PSD2 con Enable Banking**: elegir banco, permiso de solo lectura en la web del banco (≤ 180 días), vuelta con `state` comparado contra el valor cifrado en la bóveda, vincular cada cuenta del banco a una de MyMoney de la misma moneda, sincronización de saldo y movimientos de 30 días con límite por conexión (3/día) y global; nunca se guarda el IBAN (identificador opaco y últimos 4 dígitos) | `supabase/functions/{connect-bank,sync-worker}`, `_shared/enable-banking.ts`, `/conexiones/banco`, `/conexiones/retorno` | Vitest 100 % (146 pruebas en las funciones), pgTAP `103`. **Sin probar contra el servicio real** |
| 16 | **Umbrales de los avisos editables** (supuestos) | `thresholdsFrom`, `/supuestos` | Vitest 100 % |

## 2. Revisión de seguridad (skill `revision-seguridad`)

**Cumple, comprobado:** RLS activada y forzada en las tablas nuevas (metatest `001`), FKs compuestas (`050`), aislamiento por rol y entre espacios (`080`, `103`), `anon` sin permisos, `search_path = ''` en toda función, sin SQL dinámico concatenado, la clave secreta no está en `apps/web` ni en su *bundle* (la web solo llama a la función con el JWT de la persona), entradas validadas con Zod, sin `dangerouslySetInnerHTML`, logs solo con la lista blanca (la clave de acceso nunca se registra ni se devuelve), sin dependencias nuevas de terceros (`pnpm audit`: sin vulnerabilidades conocidas), sin datos reales ni nombres de personas.

| # | Gravedad | Hallazgo | Arreglo |
|---|----------|----------|---------|
| 1 | Medio | `schedule_due_syncs` comprobaba `current_user`, que en una función `security definer` es siempre el dueño: la comprobación de rol no protegía (solo la protegía el `grant`) | Se usa `session_user`; las concesiones de ejecución siguen siendo la primera barrera |
| 2 | Bajo | `connect-binance` leía el cuerpo entero antes de comprobar su tamaño | Se comprueba `content-length` antes de leer, y el texto leído después |
| 3 | Bajo | El despliegue con claves publicables nuevas podía rechazar las llamadas programadas | Documentado `--no-verify-jwt` en las funciones que se autentican con `x-cron-secret`; `connect-binance` vuelve a comprobar el JWT con la base de datos |
| 4 | Informativo | Los textos de importación y de conexión nombran Binance y Trade Republic | Son funcionales (formatos y proveedores que se pueden conectar), no avisos; el guardián de textos de avisos no los cubre. **Revisar con el dictamen legal** |
| 5 | Informativo | La API de Binance no se ha probado contra el servicio real | Campos validados de forma estricta con datos inventados; primera prueba real manual (ver `despliegue.md`) |

## 3. Pendiente, y qué necesito

| Qué | Por qué está parado | Qué se necesita |
|-----|--------------------|-----------------|
| Contrastar las plantillas de Trade Republic y Binance | Los nombres de columna son los públicos, sin un archivo real | La **fila de cabecera** (sin importes) y los valores distintos de la columna de tipo |
| Contrastar la plantilla de eToro | Hoja y columnas tomadas de la documentación pública | Un extracto real (solo la fila de cabecera de la hoja de actividad) |
| Probar PSD2 con Enable Banking | El código está hecho, pero falta la aplicación registrada (`ENABLE_BANKING_APP_ID`, clave privada), el sandbox y comprobar que cubre ING España, MyInvestor y Trade Republic; para abrirlo a terceros, contrato, EIPD y dictamen | Alta en Enable Banking (aplicación restringida a cuentas propias) y cuentas de prueba |
| Trabajador en Railway con IP fija | Exige cambiar la regla 3 de `AGENTS.md` | Aceptar ADR-0022 y esa modificación (solo al abrir a otras personas) |
| Precios de fondos y ETF (HU-38) | Requiere proveedor con licencia | Elegir proveedor |
| Parámetros fiscales del ejercicio | Ninguna cifra legal va en el código | Cargar límite y escala con su fuente (`despliegue.md`) |
| Aplicar migraciones y desplegar funciones | Regla 12 | Hacerlo la persona propietaria, primero en staging: `despliegue.md` |
| Modelos 720/721 y lotes FIFO (HU-33, HU-39) | Necesitan país por cuenta y lotes | Siguiente iteración |

## 4. Orden recomendado para ponerlo en marcha

1. Aplicar las migraciones `20261029000000` a `20261029030000` en staging (`pnpm test:db` ya está en verde).
2. Importar con el detector genérico y con las plantillas; enviar la cabecera real de Trade Republic y Binance para verificarlas.
3. Desplegar `update-prices` (si hay criptoactivos) y, después, la clave maestra, `connect-binance` y `sync-worker`.
4. Conectar Binance con una clave de solo lectura y comprobar saldo y depósitos de los últimos 89 días.
5. Registrar la aplicación en Enable Banking, configurar sus secretos (`despliegue.md`) y conectar un banco desde `/conexiones/banco`.
6. Cargar los parámetros fiscales con su fuente si se quiere la pantalla de impuestos.

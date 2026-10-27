# ADR-0020: Primera web (cuenta, hogar, inicio) y entorno de trabajo

- Estado: Aceptado
- Fecha: 2026-10-27

## Contexto
Empieza la aplicación web (`apps/web`) sobre el esquema ya aplicado. Hay que decidir contra qué base de datos se trabaja, cómo se autentica la gente y qué decisiones de diseño se fijan en el primer hito. En este entorno de desarrollo no se pueden descargar las imágenes de Docker de Supabase, así que no hay servidor de autenticación local.

## Decisión
1. **Entorno.** Por decisión expresa de la persona propietaria (2026-10-27) se trabaja contra el proyecto `main` de Supabase, que es producción, y no contra un proyecto de desarrollo. Condiciones aceptadas:
   - La confirmación de correo sigue activada y el MFA es obligatorio para entrar a los datos.
   - Tras crear la primera cuenta se desactivan los registros nuevos en Supabase (`Allow new users to sign up`); se reactivan al abrir la app a otras personas.
   - La persona propietaria comprueba que existen las copias de seguridad diarias.
   - Cada migración nueva es solo aditiva, se prueba antes en local con pgTAP y la aplica la persona propietaria.
   - Ninguna prueba automática se ejecuta contra `main`. Las pruebas de registro y MFA correrán en CI con Supabase local (Docker) cuando exista ese trabajo.
2. **Sesión.** Cookies `httpOnly`, `SameSite=Lax` y `Secure` en producción. La identidad se obtiene con `getClaims()`, que verifica la firma del JWT. El proxy refresca la sesión y redirige las rutas privadas; cada página y acción lo vuelve a comprobar (`requireReadyUser`).
3. **MFA obligatorio.** El plan permitía posponerlo en las fases 1 y 2; aquí no, porque son datos financieros reales. Sin factor TOTP verificado en la sesión (nivel `aal2`) no se accede a los datos.
4. **CSP con nonce** en el proxy, sin `unsafe-inline`; todas las páginas se renderizan por petición para llevar el nonce. `Cache-Control: private, no-store`.
5. **Lectura de datos** solo en el servidor con el JWT de la persona, de modo que decide RLS. Cada fila se valida con Zod antes de calcular; si algo no encaja, se falla en lugar de mostrar una cifra dudosa. PostgREST devuelve `bigint` y `numeric` como números JSON: solo se aceptan enteros seguros (±2^53) y decimales que se reconviertan sin pérdida; si no, se falla en lugar de redondear. Los importes del esquema no superan 10^15.
6. **Patrimonio** (`finance-core.netWorth`): suma las cuentas del hogar en la moneda base, las deudas restan, una cuenta sin valor o sin tipo de cambio se excluye y el resultado se marca como parcial. Devuelve `{ value, explanation }` y la interfaz lo muestra con «¿De dónde sale esta cifra?».
7. **Alta rápida de cuenta** guarda la cuenta y su valor de hoy como valoración manual. Son dos escrituras; si falla la segunda se retira la cuenta.
8. **Importes escritos por personas** (`parseLocalizedAmount`): la coma es el decimal; el punto solo se acepta si es inequívoco; lo ambiguo se rechaza. Nunca se multiplica un importe por 100 en silencio.
9. **Hosting.** Pendiente de decisión; Railway en una región de la UE es la opción propuesta. Antes de abrir la app a otras personas habrá que firmar el contrato de encargo con el proveedor (ficha 03).

## Alternativas consideradas
- **Proyecto `mymoney-dev` aparte** (recomendado por el equipo técnico): aísla producción y permite pruebas automáticas de registro. Rechazado por la persona propietaria mientras solo ella usa la aplicación; se retomará al abrirla a otras personas o cuando se quiera probar el registro de forma automática.
- **Rama de Supabase:** exige registrar antes las migraciones y conectar GitHub.
- **MFA opcional:** descartado por tratarse de datos reales.

## Consecuencias
- (+) Se puede usar la aplicación con datos reales desde el principio.
- (−) El registro, el MFA y las acciones con sesión solo se han probado con tests unitarios y de navegador sin sesión. La primera prueba real contra Supabase es manual, con la cuenta real.
- (−) Un error del código o del esquema ocurre sobre datos reales; se mitiga con copias diarias, migraciones aditivas probadas y la validación de filas.
- Pendiente: límite de peticiones propio por IP y cuenta (plan §6), pruebas e2e con sesión en CI, y revisar la regla «valoración sobre saldo» cuando existan movimientos (el saldo del libro puede ser más reciente que una valoración).

# 6. Seguridad: modelo de amenazas y controles

## Referencias

- **OWASP ASVS 5.0** (publicada en 2025) como estándar de verificación, **nivel 2**. Los capítulos se citan por nombre (V6 Autenticación, V8 Autorización…). [A VERIFICAR] la numeración exacta de cada requisito al redactar la lista de verificación de la fase 0; si se prefiere la 4.0.3 por la disponibilidad de herramientas, se documenta en un ADR.
- **OWASP Top 10 (edición 2025)** y **OWASP API Security Top 10 (2023)**.
- Guías de Supabase sobre RLS, seguridad de producción y claves de API.

## Activos que proteger

| Activo | Sensibilidad | Por qué |
|--------|--------------|---------|
| Datos financieros (saldos, movimientos, deudas, objetivos) | Muy alta | Permiten fraude dirigido, extorsión, ingeniería social |
| Perfil y situación familiar, datos de menores | Muy alta | Personas vulnerables |
| Credenciales, sesiones, secretos TOTP | Crítica | Llave de todo lo anterior |
| Clave secreta de Supabase (antes `service_role`), claves de proveedores | Crítica | Saltan RLS |
| Registro de auditoría | Alta | Evidencia ante incidentes |
| Avisos mostrados y su historial | Media-alta | Evidencia regulatoria |
| Archivos importados (CSV) | Muy alta | Contienen más datos de los necesarios |
| Disponibilidad y copias | Alta | Pérdida de datos irrecuperable |

## Actores

- Usuario legítimo; miembro del hogar con rol limitado; asesor invitado (de confianza parcial, temporal).
- Atacante externo no autenticado (relleno de credenciales, enumeración, abuso de la API).
- Atacante autenticado en **otro** espacio (el más importante en multitenencia: IDOR/BOLA).
- Ex-miembro del hogar (separación, conflicto familiar) con acceso que no se ha revocado.
- Persona con acceso físico al dispositivo desbloqueado.
- Dependencia comprometida (cadena de suministro).
- Administrador o desarrollador (error o abuso; tú mismo con la clave secreta).
- Encargados del tratamiento (Supabase, hosting, correo).

## Superficies de ataque

Formularios y Server Actions; Route Handlers; la API PostgREST/RPC de Supabase (alcanzable con la clave publicable y un JWT válido **aunque la UI no la use**); Auth (registro, inicio de sesión, recuperación, MFA, invitaciones); subida de CSV y Storage; exportaciones; correos con enlaces; tareas programadas y llamadas a BCE/INE; CI/CD y secretos; panel de Supabase y de hosting; dependencias npm.

## STRIDE

| # | Amenaza | Categoría | Escenario | Mitigaciones | Verificación |
|---|---------|-----------|-----------|--------------|--------------|
| T1 | Acceso a datos de otro espacio | Elevación / Divulgación | Un usuario llama a PostgREST con `space_id` o `id` ajenos | RLS forzada en todas las tablas con funciones por rol; `space_id` redundante en las patas; *grants* mínimos; RPC con `security invoker` | pgTAP por tabla y rol (sección 4); test de meta-cobertura; test E2E con dos usuarios |
| T2 | Relleno de credenciales / fuerza bruta | Suplantación | Listas de contraseñas filtradas | Límites de Supabase Auth + límite propio por IP y por cuenta en el *middleware*; MFA TOTP; comprobación de contraseñas filtradas [A VERIFICAR plan]; CAPTCHA tras fallos (Turnstile o hCaptcha, valorar privacidad) | Test de integración del limitador; alerta por pico de fallos |
| T3 | Robo de sesión | Suplantación | XSS o malware roba el token | CSP estricta con *nonce*, sin `unsafe-inline` en scripts; cookies `Secure`, `SameSite=Lax`; `HttpOnly` donde la librería lo permita [A VERIFICAR con `@supabase/ssr`]; caducidad corta del JWT de acceso (≤ 1 h) con rotación del *refresh token* y detección de reutilización; cierre de sesiones remoto | Escáner de cabeceras en CI; test E2E de cierre de sesión |
| T4 | CSRF en Server Actions | Manipulación | Sitio malicioso envía un formulario | Las Server Actions de Next.js comprueban `Origin` frente a `Host`; `SameSite=Lax`; Route Handlers mutables solo con `POST` y comprobación de `Origin` | Test de integración con `Origin` ajeno |
| T5 | Invitación interceptada o reutilizada | Suplantación | Enlace reenviado o filtrado | Token de 256 bits guardado como hash; un solo uso; 72 h; el correo del aceptante debe coincidir; revocable | pgTAP de la función `accept_invitation` |
| T6 | Ex-miembro conserva el acceso | Elevación | Separación o conflicto | Revocación inmediata (RLS consulta la membresía en cada petición; no hay permisos dentro del JWT); invalidar sesiones del usuario expulsado del espacio; aviso a los propietarios | Test: tras la revocación, la siguiente petición devuelve 0 filas |
| T7 | Asesor más allá de lo concedido | Elevación | Exportar o ver miembros | Rol `advisor` sin exportación ni auditoría; `expires_at` obligatorio comprobado por RLS | pgTAP |
| T8 | Filtración de la clave secreta | Elevación | En el *bundle* del cliente o en el repositorio | Solo en Edge Functions/tareas; nunca en `apps/web` [RECOMENDACIÓN: la web no la necesita en absoluto]; regla de lint que prohíbe el nombre de la variable fuera de `supabase/functions`; *gitleaks* en CI y *pre-commit*; protección de envío de secretos de GitHub; rotación documentada | CI falla si aparece; escaneo del *bundle* construido buscando el prefijo de la clave secreta |
| T9 | Inyección SQL | Manipulación | En RPC o SQL dinámico | Sin SQL dinámico en funciones; parámetros siempre; `search_path=''` en funciones; la web no construye SQL | Revisión + Semgrep + Security Advisor |
| T10 | XSS almacenado | Manipulación | Nombre de cuenta o descripción importada con *script* | React escapa por defecto; prohibido `dangerouslySetInnerHTML` (regla de lint); CSP; importación como texto plano; exportación CSV protegida contra inyección de fórmulas (prefijo `'` para `= + - @`) | Tests de las funciones de exportación; lint |
| T11 | CSV malicioso | DoS / Manipulación | Archivo gigante, codificación rara | 5 MB máximo; límite de filas; análisis en el servidor con tiempo límite; sin evaluación de fórmulas; *bucket* privado | Tests con *fuzzing* de archivos |
| T12 | Abuso de recursos de la API | DoS | Peticiones masivas, consultas caras | Límite por usuario y por IP en el *middleware*; paginación obligatoria; `statement_timeout` por rol en Postgres; límites de filas en PostgREST | Test de carga ligero en *staging* |
| T13 | Manipulación del historial | Repudio | Alguien borra rastros | Auditoría solo de inserción en un esquema no expuesto, encadenada por hash; exportación periódica fuera de la base de datos (fase 2) | pgTAP: ni el rol de la aplicación puede U/D; verificación de la cadena en una tarea diaria |
| T14 | Datos personales en logs o errores | Divulgación | Importes o correos en trazas | Lista blanca de campos en los logs; *scrubbing* en el SDK de errores; tests que fallan si un log contiene patrones de IBAN, correo o importe | Test unitario del *logger* |
| T15 | Dependencia comprometida | Manipulación | Paquete npm malicioso | Versiones fijadas con *lockfile*; `pnpm` con `--frozen-lockfile`; Dependabot o Renovate con espera mínima de unos días para versiones nuevas; `pnpm audit` y OSV-Scanner; scripts de instalación desactivados salvo lista blanca; SBOM | CI |
| T16 | Pérdida de datos | Denegación | Borrado accidental, corrupción, error de migración | Copias diarias (incluidas en el plan) + PITR en producción a partir de la fase 2; migraciones revisadas y probadas en *staging*; prueba de restauración trimestral documentada | Informe de la prueba de restauración |
| T17 | Exportación interceptada | Divulgación | Enlace de descarga filtrado | AAL2; URL firmada de 15 min y un solo uso; archivo borrado a las 24 h; evento de auditoría y correo de aviso al usuario | E2E |
| T18 | Recuperación de cuenta como vía de ataque | Suplantación | Toma del correo | Recuperar la contraseña no desactiva el MFA; avisos por correo de cambios de seguridad; códigos de recuperación de MFA | E2E |
| T19 | Acceso físico a un dispositivo desbloqueado | Divulgación | Móvil familiar | Modo "ocultar importes"; inactividad configurable; reautenticación para acciones sensibles | E2E |
| T20 | Abuso administrativo | Elevación | Uso de la clave secreta o del panel | MFA obligatorio en GitHub, Supabase y hosting; mínimo de personas con acceso; acceso a producción registrado; ningún dato real en desarrollo | Revisión trimestral de accesos |
| T21 | Inyección de instrucciones en IA (fase 2+) | Manipulación | Descripción importada que instruye al modelo | Solo se envían agregados seudonimizados, nunca descripciones libres; la salida se valida contra el nivel permitido | Batería de pruebas adversarias |

## Controles mapeados

| Área ASVS 5.0 (capítulo) | Controles en MyMoney | OWASP Top 10 2025 / API Top 10 |
|--------------------------|----------------------|--------------------------------|
| Codificación y saneamiento | Escapado de React, sin HTML de usuario, CSV seguro | A05 Inyección |
| Validación y lógica de negocio | Zod en el servidor en cada entrada; invariantes en la base de datos (cuadre, titularidad 100 %, al menos un propietario) | A06 Diseño inseguro; API6 |
| Seguridad del *frontend* web | CSP con *nonce*, `frame-ancestors 'none'`, HSTS con *preload*, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva, *Trusted Types* cuando sea viable | A02 Configuración |
| API y servicios web | RPC con *grants* explícitos; sin exposición de esquemas internos; paginación; límites | API1 BOLA, API3, API4, API5, API8 |
| Gestión de archivos | Tamaño, tipo, *bucket* privado, URL firmada, borrado programado | API4 |
| Autenticación | Contraseña ≥ 12, comprobación de filtradas, TOTP, limitación, mensajes neutros, recuperación segura | A07 |
| Gestión de sesiones | Expiración corta, rotación del *refresh*, revocación, cierre remoto, reautenticación para lo sensible | A07 |
| Autorización | RLS por espacio y rol con denegación por defecto; AAL2 para lo sensible; pruebas automáticas | A01; API1, API5 |
| Tokens autocontenidos | Verificación de JWT con las claves de firma asimétricas de Supabase [A VERIFICAR disponibilidad en el plan]; los permisos se leen de la base de datos, no del JWT | A07 |
| Criptografía | TLS 1.2+; cifrado en reposo del proveedor; hashes SHA-256 para tokens y huellas; HMAC con secreto para seudónimos; sin criptografía casera | A04 |
| Comunicaciones seguras | HTTPS obligatorio, HSTS, sin contenido mixto | A04 |
| Configuración | Entornos separados, secretos en el gestor del hosting y de Supabase, nada en el repositorio, *Security Advisor* | A02 |
| Protección de datos | Minimización (sin IBAN completo, año de nacimiento opcional), retención definida, exportación y borrado, cabeceras `Cache-Control: no-store` en páginas con datos | — |
| Codificación segura y arquitectura | TypeScript estricto, dependencias fijadas, SAST, revisión de código, ADR | A03 Cadena de suministro; A08 Integridad |
| Registro y gestión de errores | Auditoría inmutable, logs sin PII, alertas, errores genéricos al usuario y detallados (sin datos) en el servidor | A09; A10 Condiciones excepcionales |

## Gestión de secretos

- Inventario en `docs/seguridad/secretos.md` (nombre, dónde vive, quién lo usa, cómo rotarlo, última rotación). **Nunca** los valores.
- `apps/web` solo conoce la URL de Supabase, la clave **publicable** y los secretos propios del servidor (HMAC de seudónimos, *token* del proveedor de errores).
- Clave secreta de Supabase: solo en los secretos de Edge Functions/tareas. Supabase ofrece claves secretas nuevas revocables individualmente; usarlas en lugar de la `service_role` heredada [A VERIFICAR estado en el momento de crear los proyectos].
- Rotación: cada 6 meses y ante cualquier sospecha; procedimiento probado en *staging*.
- `.env*` en `.gitignore`; `.env.example` sin valores; *gitleaks* en *pre-commit* y CI.

## Cifrado

- **En tránsito**: TLS en todo el recorrido (navegador ↔ hosting ↔ Supabase).
- **En reposo**: cifrado del disco del proveedor (Supabase lo indica para la base de datos y Storage) [A VERIFICAR en su documentación de seguridad y DPA].
- **A nivel de campo**: ver ADR-0012. En el MVP **no** se cifran los importes (romperían los cálculos en la base de datos y la clave estaría en el mismo servidor que los descifra, con poco beneficio real). En su lugar, se **minimiza**. Se reevalúa para notas de texto libre en la fase 2 (cifrado en la aplicación con una clave fuera de la base de datos).

## Auditoría (ADR-0009)

Eventos: inicio de sesión correcto/fallido (desde los *hooks* de Auth o los logs de Auth), activación o desactivación de MFA, cambios de membresía y rol, invitaciones, exportaciones, borrados de cuenta y espacio, importaciones y reversiones, cambios de *flags*, acceso de asesor. Cada evento tiene `prev_hash` y `hash = SHA-256(prev_hash ‖ contenido canónico)`, lo que permite detectar manipulaciones. Retención: 2 años [SUPUESTO a validar en la EIPD], con identificadores seudonimizados que sobreviven al borrado de la cuenta.

## Limitación de peticiones

- *Middleware* con un contador de ventana deslizante. En la fase 1 basta con una tabla en Postgres o los límites del propio hosting; en la fase 2, un almacén clave-valor gestionado en la UE si el volumen lo pide [DECISIÓN PENDIENTE, ver 12].
- Límites iniciales: autenticación 5/min por IP y 10/h por cuenta; escrituras 60/min por usuario; importaciones 10/h por espacio; exportaciones 3/día por usuario.

## Copias de seguridad y restauración

- Fase 1: copias diarias incluidas en el plan de pago de Supabase (o *dumps* propios cifrados si se usa el plan gratuito, ver 11); exportación semanal cifrada a un almacenamiento en la UE de tu propiedad.
- Fase 2+: PITR en producción.
- **Prueba de restauración trimestral**: restaurar en un proyecto aislado, ejecutar los tests de conciliación y anotar el RTO y el RPO reales. Objetivo inicial: RPO ≤ 24 h (fase 1), ≤ 5 min (fase 2+ con PITR); RTO ≤ 4 h.
- Borrado y copias: un dato borrado sigue en las copias hasta que estas caducan; se informa en la política de privacidad y, si se restaura una copia, se vuelven a aplicar los borrados registrados en `private.data_requests`.

## Respuesta a incidentes

Documento `docs/seguridad/respuesta-incidentes.md` con:
1. **Detección**: alertas, avisos del proveedor, informes de usuarios (`security.txt` con contacto y política de divulgación responsable).
2. **Clasificación**: gravedad según los datos y el número de personas afectadas.
3. **Contención**: rotar claves, revocar sesiones (`auth.sessions`), activar el modo de solo lectura (*flag* global), bloquear IP.
4. **Erradicación y recuperación**: parche, restauración si procede, verificación de la cadena de auditoría.
5. **Notificación**: a la AEPD **en 72 horas** desde que se tiene constancia, si la brecha supone un riesgo para los derechos (art. 33 RGPD); a los afectados sin dilación indebida si el riesgo es alto (art. 34). Plantillas preparadas. Registro interno de **todas** las brechas, se notifiquen o no (art. 33.5).
6. **Lecciones aprendidas**: informe posterior sin culpables y acciones con responsable y fecha.
Simulacro de mesa una vez por fase.

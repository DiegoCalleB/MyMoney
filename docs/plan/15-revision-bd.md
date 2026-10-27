# 15. Revisión de la arquitectura de base de datos

Fecha: 2026-10-26. Alcance: las 4 migraciones de `supabase/migrations/` (43 tablas en `public`, `ref`, `audit` y `private`), sus 252 tests pgTAP y los resultados de rendimiento. **Qué significa "revisada" aquí:** diseño contrastado con el catálogo real de tu proyecto Supabase, tests automáticos con mutación y un banco de rendimiento. No sustituye a una revisión externa antes de la fase 3 (capítulo 6).

## 1. Qué se comprobó contra tu proyecto Supabase real (solo lectura y ensayos revertidos)

| Comprobación | Resultado |
|---|---|
| Rol `postgres` | `BYPASSRLS` sin ser superusuario → las funciones `security definer` leen tablas con RLS forzada |
| Permisos por defecto de Supabase en `public` | `anon`, `authenticated` y `service_role` reciben todo por defecto → las migraciones los retiran (`alter default privileges`) |
| Política en `storage.objects` (propiedad de `supabase_storage_admin`) | Se puede crear desde `postgres` (ensayo revertido) |
| Disparadores sobre `auth.users` | Permitidos; un disparador con función en un esquema sin `USAGE` para el invocador se ejecuta |
| `security_invoker`, `unique … nulls not distinct`, `on delete set null (columna)` | Soportados (Postgres 17) |
| `auth.mfa_factors.status` | enumerado `unverified`/`verified` (lo usa AAL2) |
| Extensiones | `pgcrypto` en `extensions`; **sin** `pg_cron` ni `pg_graphql` |

## 2. Problemas encontrados en el primer borrador y cómo se corrigieron

| # | Problema | Gravedad | Corrección |
|---|---|---|---|
| 1 | Las políticas llamaban a una función **por fila** | Rendimiento (316× más lento con 200.000 filas) | Arrays de espacios evaluados una vez por consulta (`= any ((select private.readable_space_ids())::uuid[])`) |
| 2 | Las FKs entre tablas con `space_id` eran simples: un usuario con permiso de escritura en el espacio A podía referenciar cuentas del espacio B conociendo su id | **Alta** (fuga entre espacios) | FKs **compuestas** `(xxx_id, space_id)` en todo el esquema + metatest que falla si falta alguna |
| 3 | Cadena de auditoría global con un bloqueo para todos los espacios y sin retención posible | Media | Una cadena por espacio, bloqueo por espacio, purga por retención con ancla (único camino para borrar) |
| 4 | Una flag con ámbito de espacio era legible por otros usuarios (revelaba ids ajenos) | Baja | Política que solo muestra flags del propio espacio |
| 5 | Sin borrado real de cuenta (la clave secreta en la web habría sido necesaria) | Media (RGPD) | RPC `delete_my_account` (AAL2) que borra el usuario y los espacios que solo él posee |
| 6 | Escritura directa en el libro de movimientos: se podía dejar descuadrado | Alta (integridad) | Solo RPC; cuadre por moneda, reglas por tipo y patas inmutables impuestos en la base de datos |
| 7 | `PUBLIC` tenía `EXECUTE` por defecto en toda función nueva | Media | `alter default privileges revoke execute … from public` + concesiones explícitas + metatests |
| 8 | Validación del cuadre con ~6 consultas por fila: una carga de 100.000 movimientos no terminaba en 10 min | Rendimiento | Dos consultas por validación; **commit de 100.000 movimientos en 9,5 s** (con `ANALYZE` previo, ver 5) |
| 9 | Una FK sin índice de apoyo en `import_rows` | Rendimiento | Detectada por el metatest de índices; corregida |
| 10 | Un hueco de tests (flags de otro espacio) | — | Detectado por la prueba de mutación; test añadido |

## 3. Decisiones de arquitectura de la base de datos (ADR-0014)

1. **Aislamiento en capas:** RLS forzada + permisos por operación y columna + FKs compuestas + arrays de espacios. `space_id`, `id` y `created_at` no son actualizables por usuarios.
2. **Escritura del libro solo por RPC** (`create_transaction`, `reverse_transaction`, `delete_transaction`), con comprobación explícita de permisos y `space_id` siempre tomado del parámetro verificado (el JSON no puede elegirlo).
3. **Invariantes en la base de datos**, no solo en la aplicación: cuadre por moneda, traspaso/canje/compra/venta sin patas externas, aportación/retirada/ingreso/gasto con pata externa, moneda de la pata de efectivo = moneda de la cuenta, titulares = 100 %, repartos = 100 %, categoría del mismo tipo que el movimiento.
4. **Dinero acotado:** importes en `bigint` con límite ±10¹⁵ unidades mínimas (cabe siempre en un entero seguro de JavaScript y las sumas no desbordan).
5. **Corrección por reversión**, borrado solo dentro de 24 h y edición limitada a descripción, estado (pendiente → liquidado) y fecha mientras es reciente o está pendiente.
6. **Ingresos y gastos dentro del mismo libro** (ADR-0016): un gasto es una pata externa con categoría; así los traspasos no se cuentan nunca como gasto.
7. **Avisos:** nivel limitado a 1-2 en la tabla y en la RPC (doble barrera con las flags).
8. **Sin `pg_cron`:** el mantenimiento (`private.purge_expired`, `audit.purge_older_than`, `audit.verify_all`) son funciones listas para programar con una función programada de Supabase o activando `pg_cron`.

## 3 bis. Revisión final antes de la primera migración remota (27-10-2026, ADR-0018)

- **Simplificación:** de 42 a 34 tablas en `public`. Bolsillos en lugar de objetivos y grupos de cuentas; hipótesis como planes `what_if`; alternativas como activos con ficha; coste, riesgo y peor caída solo en `asset_fact_sheets`.
- **Huecos cerrados:** reglas por producto, revisiones y listas de comprobación, procedencia de movimientos y de valoraciones de extractos, PDF en importaciones y borrado del original.
- **Rendimiento:** cinco tablas solo tenían índices parciales por `space_id` (el borrado en cascada no los usa); ahora tienen uno completo. Un índice redundante eliminado.
- **Seguridad:** sin SQL dinámico en las validaciones de sumas; 17 textos libres etiquetados `[pii]`.
- **Comprobación:** el esquema que resulta de pegar el archivo único es idéntico (volcado de esquema) al de aplicar las cinco migraciones por separado.

## 3 ter. Segunda revisión (27-10-2026, ADR-0019)

- **Históricos para rentabilidad real:** el reparto de bolsillos tiene vigencia (`effective_from`); junto con movimientos, valoraciones, tipos de cambio e IPC fechados, la rentabilidad nominal y real de cada bolsillo es reproducible en cualquier fecha.
- **Entidades normalizadas** (`institutions`) para concentración y fondo de garantía.
- **Avisos enlazados** con la regla del usuario; una sola definición de `upsert_recommendation`.
- **IA:** consentimiento demostrable y revocable (`user_consents`) y una única puerta (`ai_explanations_allowed`).
- **Historial de tipos de préstamos** y **parámetros fiscales con fuente** (`ref.tax_parameters`).
- **Tests de catálogo más estrictos:** un índice parcial solo cuenta como apoyo de una FK si su condición es `IS NOT NULL` sobre una columna de esa FK.

## 4. Pruebas

| Capa | Qué hay | Resultado |
|---|---|---|
| pgTAP | 15 archivos, **322 tests**: metatests de catálogo (RLS forzada, FKs compuestas con índice utilizable, sin índices redundantes, vistas `security_invoker`, políticas envueltas, funciones sin `search_path` mutable, anon sin permisos), aislamiento **generado para cada tabla** con un fixture obligatorio, roles (propietario, editor, solo lectura, asesor vigente y caducado), invitaciones, auditoría, libro, ingresos y gastos, importaciones, Storage, borrado de cuenta y planes de ejecución | Verde |
| Mutación | `scripts/db-mutation-check.py`: 25 fallos introducidos a propósito (política abierta, RLS sin forzar, FK sin espacio, escritura directa, descuadre permitido, nivel 3 permitido, bucket abierto, MFA omitido, auditoría borrable, reparto de bolsillos > 100 %, procedencia falsificable, historial de reglas escribible, hipótesis marcada como hecha, índice parcial como único apoyo de una FK, consentimiento en nombre de otro, reparto histórico mezclado, entidad duplicada…) | **25/25 detectados** |
| Dominio | `finance-core`: 37 tests de ejemplos y propiedades | Verde, 100 % de líneas y ramas |
| Verificación en el entorno real | `supabase/verify/001-security-checks.sql` (solo lectura) | 0 filas esperadas tras aplicar |

## 5. Rendimiento (Postgres 16 local, 1 espacio, 200.000 patas, usuario autenticado con RLS)

| Operación | Tiempo de ejecución |
|---|---|
| Saldos de todas las cuentas (agregado en servidor) | 85 ms |
| Patas de una cuenta (5.000 filas, índice) | 2,4 ms |
| Últimos 50 movimientos (índice por fecha, sin ordenar) | 0,26 ms |
| Contar 200.000 filas: política por fila frente a array (InitPlan) | 9.518 ms frente a 30 ms (**316×**) |
| Commit de 100.000 movimientos / 200.000 patas con 300.000 validaciones | 9,5 s |

Son medidas de un entorno de pruebas, no de producción: la instancia de Supabase será distinta. **Aviso operativo:** tras una carga masiva (miles de movimientos de golpe) conviene `ANALYZE` antes de confirmar; sin estadísticas, el planificador puede elegir recorridos completos y la validación se vuelve muy lenta (con 100.000 movimientos pasaba de 9,5 s a más de 9 minutos). El importador lo hará él mismo.

## 6. Límites conocidos y riesgo residual

- La auditoría detecta manipulaciones pero **no las impide a quien tenga control total de la base de datos**; el anclaje externo del último hash va en la fase 2.
- Las validaciones diferidas se ejecutan por fila (~0,05 ms con estadísticas): suficiente para uso personal y familiar; si un espacio superara millones de patas habría que pasar a validación por lotes.
- **Aplicada el 27-10-2026** en el proyecto `caoykbmwqxmuubfwoafh` (Supabase lo etiqueta como rama `main` = PRODUCTION; estaba vacío, sin datos reales), desde el editor SQL y en una transacción. **Desde aquí `main` se trata como producción:** ningún dato real hasta tener autenticación con MFA y copias probadas, y los cambios de esquema se prueban antes en una rama de desarrollo. `supabase/verify/001-security-checks.sql`: **0 filas**. Avisos de Supabase, todos revisados:
  - *Seguridad, INFO* (`audit.events`, `private.app_settings` con RLS y sin políticas): intencionado, nadie accede.
  - *Seguridad, WARN* (10 funciones `security definer` ejecutables por usuarios): son las RPC del diseño (crear espacio, movimientos, invitaciones, avisos…); cada una comprueba permisos de forma explícita.
  - *Rendimiento, INFO, 49 «claves foráneas sin índice»*: falso positivo por el orden de columnas. El aviso exige `(account_id, space_id)`; los índices son `(space_id, account_id)` para que también sirvan a las consultas por espacio de la RLS. Comprobado con `EXPLAIN` (60.000 filas): la comprobación de la clave foránea usa el índice (0,04 ms).
  - *Rendimiento, INFO, 95 «índices sin usar»*: esperado en una base de datos vacía; se revisa con uso real, no antes.
  - *Rendimiento, INFO* (conexiones de Auth en valor absoluto): ajuste del proyecto, no del esquema.
- Las migraciones se aplicaron desde el editor SQL, por lo que no figuran en la lista de migraciones de Supabase; al instalar la CLI se registran con `supabase migration repair`.
- Los tests corren en Postgres 16 con una capa que imita Supabase; la comprobación contra el proyecto real se limita a las sentencias delicadas (sección 1) y al script de verificación posterior.
- Sin revisión externa independiente todavía.

## 7. Cómo aplicar (decisión del propietario)

1. **Opción CLI (recomendada):** `supabase link --project-ref <ref>` y `supabase db push`.
2. **Opción editor SQL:** `bash scripts/concat-migrations.sh` genera `supabase/dist/all-migrations.sql` (una transacción); pégalo y ejecútalo.
3. Después: ejecutar `supabase/verify/001-security-checks.sql` (0 filas) y revisar los avisos de seguridad y rendimiento del proyecto.
4. Tratar este proyecto como **staging**; los datos reales irán a un proyecto de producción aparte.

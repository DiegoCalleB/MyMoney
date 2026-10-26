# 12. Riesgos y decisiones pendientes

## Riesgos (ordenados por impacto × probabilidad)

| # | Riesgo | Impacto | Prob. | Mitigación | Señal de alarma |
|---|--------|---------|-------|------------|-----------------|
| R1 | **Los avisos se consideran asesoramiento sin autorización** (CNMV) | Crítico: sanción, cierre del servicio | Media en fase 3 si no se valida | Niveles con *flags*, plantillas cerradas sin productos, test que prohíbe nombres de producto, dictamen legal antes de cobrar | Cualquier petición de "dime qué fondo compro" convertida en funcionalidad |
| R2 | **Fuga de datos entre espacios** (fallo de RLS) | Crítico | Baja con tests | RLS forzada, pgTAP por tabla y rol, meta-test, E2E de dos usuarios, revisión externa | Tabla nueva sin test; uso de la clave secreta en la web |
| R3 | **Cifras incorrectas** (traspasos tomados como aportaciones, redondeos, tipos de cambio de otra fecha) | Alto: pérdida de confianza, decisiones erróneas del usuario | Media | Patas que cuadran, librería pura con propiedades, conciliación contra extractos, explicación de cada cifra | Diferencias con el extracto de la entidad |
| R4 | **Brecha de seguridad con notificación a la AEPD** | Crítico | Baja | Capítulo 6; MFA; mínimos privilegios; plan de incidentes ensayado | Alertas de autenticación; dependencias vulnerables sin parchear |
| R5 | **Pérdida de datos** | Alto | Baja | Copias, PITR, pruebas de restauración, migraciones expandir/contraer | Prueba de restauración no hecha en el trimestre |
| R6 | **Fricción de entrada de datos**: se abandona el uso | Alto para el producto | Alta | Importación pronto, valoraciones rápidas, plantillas por entidad; PSD2 en la fase 3 | Valoraciones de más de 60 días en la mayoría de cuentas |
| R7 | **Datos de categoría especial inferidos o revelados por categorías y descripciones** (ahora que hay ingresos y gastos en el MVP) | Alto (RGPD) | Media | Categorías elegidas por el usuario, semilla neutra, sin inferencia, descripciones opcionales y acotadas, EIPD actualizada antes de la fase 2 | Una categoría o regla que nombre salud, creencias o afiliaciones |
| R8 | **Parámetros fiscales desactualizados o mal interpretados** | Medio-alto | Media | Parámetros por ejercicio con fuente y fecha de verificación; fiscalidad solo informativa; revisión anual en enero | Parámetro sin `verified_on` del ejercicio en curso |
| R9 | **Dependencia de un proveedor** (Supabase, hosting) | Medio | Baja | Postgres estándar, migraciones SQL propias, sin funciones exclusivas en el dominio; plan B autoalojado documentado | Cambios de precio o condiciones |
| R10 | **Alcance que crece** (módulos personales, IA, app nativa) | Medio | Alta | Hoja de ruta con criterios de salida; "qué no haremos"; módulos detrás de *flags* | Funciones de fase 2-3 colándose en el MVP |
| R11 | **Datos de menores tratados indebidamente** | Alto | Baja | Sin usuarios menores; datos mínimos; consulta legal | Petición de acceso para los hijos |
| R12 | **Disponibilidad de agregadores PSD2 y precios de mercado** | Medio | Media | Fuera del MVP; evaluación en la fase 3 con ofertas reales | — |
| R13 | **Tiempo disponible** | Medio | Alta | Fases cortas con valor propio; el MVP te sirve aunque nunca llegue la fase 3 | Iteraciones que se alargan más del doble |

## Decisiones pendientes (por impacto)

| # | Decisión | Opciones | Recomendación | Cuándo | Depende de |
|---|----------|----------|---------------|--------|------------|
| D1 | Modelo regulatorio de la fase 3 | Solo niveles 1-2 / socio autorizado / autorización propia (EAFI) | Solo 1-2 hasta el dictamen | Fin de la fase 2 | Pregunta 2, abogado |
| D2 | Visibilidad dentro de un hogar | Todo compartido / visibilidad por cuenta / dos espacios + vista consolidada | Dos espacios + vista consolidada si hace falta privacidad (más simple y seguro que RLS por cuenta) | Fase 0 | Pregunta 1 |
| D3 | Hosting de la web | Vercel UE / proveedor UE con contenedor | Vercel en fases 0-2 por simplicidad; reevaluar en la fase 3 | Fase 0 | Pregunta 5 |
| D4 | Supabase Pro desde el día 1 | Gratis + copias propias / Pro | Pro desde que haya datos reales (copias y sin pausa) | Fase 1, iteración 1 | Pregunta 9 |
| D5 | PITR | Sí desde la fase 2 / copias lógicas horarias | PITR desde la fase 2 | Inicio de la fase 2 | Número de usuarios |
| D6 | Profundidad fiscal | Informativa / FIFO y plusvalías | Informativa en el MVP, FIFO en la fase 2 | Fase 1 | Pregunta 6 |
| D7 | Gasto y presupuestos | MVP / fase 2 / nunca | **Decidido: MVP** (petición del usuario, 26-10-2026); EIPD antes de la fase 2 | Fase 1 | Pregunta 7 resuelta |
| D8 | IA generativa | Nunca / explicaciones en la fase 2 / asistente | Explicaciones en la fase 2 tras la evaluación | Fase 2 | EIPD, coste |
| D9 | Librería decimal | decimal.js / big.js / implementación propia sobre `bigint` | decimal.js (madura, precisión y modos de redondeo configurables) [A VERIFICAR versión y mantenimiento en la fase 0] | Fase 0 | — |
| D10 | Proveedor de correo y de errores | Varios con región UE | El que tenga región UE y DPA claros | Fase 0-1 | Pregunta 5 |
| D11 | Analítica de producto | Ninguna / propia sin cookies / herramienta UE | Ninguna en la fase 1; propia agregada en la fase 2 | Fase 2 | — |
| D12 | Pasarela de pago y facturación | Stripe / Paddle (comerciante registrado) / otras | Decidir con la gestoría por el IVA de servicios digitales | Fase 3 | Forma jurídica |

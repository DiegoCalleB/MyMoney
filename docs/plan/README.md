# Plan de MyMoney: aplicación de finanzas personales

> Estado: **BORRADOR PARA APROBACIÓN**. Fecha: 2026-10-26. No se escribe código de producción hasta que lo apruebes.
> Convención usada en todo el plan:
> - **[HECHO]**: dato verificable con fuente citada.
> - **[SUPUESTO]**: hipótesis de trabajo que puede cambiar con tus respuestas.
> - **[RECOMENDACIÓN]**: decisión que propone el equipo, con su justificación.
> - **[A VERIFICAR]**: no lo sabemos con certeza; se indica cómo comprobarlo.

## Índice

| # | Documento | Contenido |
|---|-----------|-----------|
| 0 | [00-preguntas-y-supuestos.md](00-preguntas-y-supuestos.md) | Las 10 preguntas que cambian el diseño y el supuesto por defecto de cada una |
| 1 | [01-vision-alcance.md](01-vision-alcance.md) | Problema, perfiles, propuesta de valor, qué no haremos |
| 2 | [02-historias-usuario.md](02-historias-usuario.md) | Historias priorizadas con criterios de aceptación |
| 3 | [03-arquitectura.md](03-arquitectura.md) | Diagrama, componentes, flujos, resumen de ADR |
| 4 | [04-modelo-datos.md](04-modelo-datos.md) | ER, tablas, tipos, índices, matriz RLS |
| 5 | [05-calculos-financieros.md](05-calculos-financieros.md) | Librería de dominio: funciones, fórmulas, casos límite, tests |
| 6 | [06-seguridad.md](06-seguridad.md) | Modelo de amenazas STRIDE y controles mapeados a OWASP ASVS |
| 7 | [07-privacidad-y-regulacion.md](07-privacidad-y-regulacion.md) | RGPD/EIPD y análisis regulatorio de las recomendaciones |
| 8 | [08-experiencia.md](08-experiencia.md) | Pantallas, navegación, estados vacíos, accesibilidad, móvil |
| 9 | [09-calidad-cicd-entornos.md](09-calidad-cicd-entornos.md) | Pirámide de tests, CI/CD, entornos |
| 10 | [10-hoja-de-ruta.md](10-hoja-de-ruta.md) | Fases, entregables, criterios de salida, riesgos |
| 11 | [11-costes.md](11-costes.md) | Costes estimados por fase |
| 12 | [12-riesgos-y-decisiones.md](12-riesgos-y-decisiones.md) | Riesgos y decisiones pendientes por impacto |
| 13 | [13-estructura-repositorio.md](13-estructura-repositorio.md) | Estructura del monorepo y `CLAUDE.md` inicial |
| — | [../adr/](../adr/) | Registros de decisiones de arquitectura (ADR) |

## Resumen ejecutivo

1. **Producto**: una app web (PWA) para ver el patrimonio neto real, entender su evolución (aportado frente a ganado, rentabilidad real frente a inflación, comisiones, riesgo), planificar objetivos y recibir **avisos explicables** sobre los propios datos. España primero; preparada para multihogar, multipaís y suscripción.
2. **Arquitectura** [RECOMENDACIÓN]: mantenemos tu preferencia, con matices. Monorepo `pnpm` con:
   - `apps/web`: Next.js (App Router) + TypeScript estricto, desplegado en región UE.
   - `packages/finance-core`: librería de dominio pura (aritmética decimal, XIRR, TWR, proyecciones, reglas de avisos), 100 % testeada con tests de propiedades.
   - `packages/schemas`: esquemas Zod compartidos.
   - `supabase/`: migraciones SQL versionadas, políticas RLS y tests pgTAP.
   - Supabase en la UE (Postgres + Auth + RLS + Storage), con proyectos separados para *staging* y *producción* y Supabase local para desarrollo.
3. **Modelo contable** [RECOMENDACIÓN, ADR-0006]: transacciones con *patas* (partida doble ligera). Un traspaso interno es una sola transacción con dos patas que suman cero; una aportación externa tiene una pata `external`. Así **nunca** se confunde un traspaso con una aportación, que es el error más común de estas apps.
4. **Dinero** [ADR-0005]: efectivo en `bigint` de unidades mínimas + moneda ISO 4217; cantidades y precios en `numeric` con precisión explícita; tipos de cambio y precios siempre con fecha; fechas contables como `date` y la zona horaria del espacio explícita.
5. **Seguridad**: RLS con denegación por defecto en todas las tablas, probada con pgTAP en CI; MFA TOTP desde el día 1; auditoría inmutable encadenada por hash; CSP estricta con *nonce*; ASVS nivel 2 como objetivo verificable.
6. **Recomendaciones**: niveles 1 (educativo) y 2 (avisos por reglas, sin productos concretos) activados; **nivel 3 (productos personalizados) desactivado** por *feature flag* hasta tener dictamen legal y, si procede, socio autorizado (ESI o EAFI). IA generativa fuera del MVP.
7. **Hoja de ruta**: Fase 0 (cimientos, ~3 semanas) → Fase 1 MVP personal (~8-10 semanas) → Fase 2 grupo cerrado de amigos (~8 semanas) → Fase 3 clientes de pago (sin fecha hasta superar la validación legal). Estimaciones calculadas con ~10 h/semana de dedicación [SUPUESTO].
8. **Coste**: Fase 0-1 cerca de 0-30 €/mes; Fase 2 ~60-90 €/mes; Fase 3 ~250-400 €/mes más asesoría legal (puntual, la partida más cara). Todo **[ESTIMACIÓN]**: ver [11-costes.md](11-costes.md).

## Qué necesito de ti para aprobar

- Respuestas (aunque sean parciales) a [00-preguntas-y-supuestos.md](00-preguntas-y-supuestos.md). Si no respondes una pregunta, se aplica su supuesto por defecto.
- Visto bueno o cambios a los ADR marcados como **Propuesto**.
- Si es posible, acceso al prototipo de una página para extraer las reglas y los umbrales de los avisos.

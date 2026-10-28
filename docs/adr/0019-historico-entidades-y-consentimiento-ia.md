# ADR-0019: Reparto de bolsillos con historial, entidades normalizadas, avisos enlazados y consentimiento para IA

- Estado: Propuesto
- Fecha: 2026-10-27

## Contexto
Segunda revisión antes de la primera migración remota, con los objetivos del propietario como criterio: saber dónde y cómo está el dinero, el rendimiento real (después de inflación) de cada bolsillo a lo largo del tiempo y avisos explicados con IA. El propietario insiste en tener históricos para calcular rentabilidades reales.

## Decisión
1. **Reparto de bolsillos con vigencia.** `pocket_allocations.effective_from`: el reparto de una cuenta en una fecha es el conjunto de filas con la mayor fecha ≤ esa fecha. Cambiar el reparto añade un conjunto nuevo y conserva el anterior. `public.pocket_allocations_on(espacio, fecha)` devuelve el reparto vigente. Sin esto, el rendimiento pasado de un bolsillo cambiaría cada vez que se reasigna dinero.
2. **Entidades normalizadas.** `institutions` (nombre único por espacio, tipo y país) sustituye al texto libre `accounts.institution_name`. Así la concentración por entidad y el límite del fondo de garantía (por entidad y titular) no se rompen por escribir el nombre de dos formas, y el país señala cuentas en el extranjero.
3. **Avisos enlazados con su regla.** `recommendations.advice_rule_id` (FK compuesta) identifica la regla del usuario que generó cada aviso. `upsert_recommendation` se define una sola vez, con ese parámetro opcional.
4. **IA con consentimiento demostrable.** `user_consents` (tabla del usuario, con RLS por `user_id`): consentimiento por propósito con la versión del texto aceptado, revocable y con historial. `public.ai_explanations_allowed(espacio)` es la única puerta: exige la flag `ai.explanations` y un consentimiento vigente. La IA solo reformula avisos ya generados por reglas; nunca genera recomendaciones ni nombra productos (regla 20 y ADR-0010).

5. **Historial del tipo de los préstamos** (`loan_rate_periods`): cada revisión de una hipoteca variable o mixta, con el índice aplicado y su fuente.
6. **Parámetros legales con fuente** (`ref.tax_parameters`): límites y tramos por país y ejercicio, con URL oficial y fecha de verificación; lectura para usuarios, escritura solo del servidor. Ninguna cifra legal en el código.
7. **Sin piezas fantasma en el plan:** los módulos futuros se activan con *flags* (sin tabla `space_modules`) y la exportación RGPD se descarga al momento (sin almacén de exportaciones).

8. **Aportaciones periódicas y precios** (cierre de dos huecos que el plan ya prometía): `recurring_rules.kind = 'contribution'` con cuenta destino y producto (el plan de pensiones mensual alimenta «aportado frente a ganado»); `ref.prices` (precio por ISIN o símbolo y día, con fuente, de lectura pública y escritura del servidor) para valorar posiciones como cantidad × precio.

## Qué ya tenía historial (sin cambios)
Movimientos (fecha contable), valoraciones por cuenta y posición, tipos de cambio por fecha (BCE), IPC mensual por país (INE), fichas y composiciones de producto, tramos de remuneración, supuestos y presupuestos con vigencia, revisiones de reglas.

## Alternativas consideradas
- Historial del reparto por trigger con marcas de tiempo: no permite fechar un cambio en el pasado (fecha contable).
- Filas con fecha de inicio y fin: más difícil de mantener coherente que conjuntos por fecha de inicio.
- Consentimiento como columna en `profiles`: no conserva el historial ni la versión aceptada.

## Consecuencias
- (+) Rentabilidad nominal y real por bolsillo reproducible en cualquier fecha; concentraciones correctas; IA bloqueada por defecto y auditable.
- (−) La interfaz edita "el reparto desde hoy" (un conjunto nuevo) en lugar de modificar filas; se oculta tras un único formulario.

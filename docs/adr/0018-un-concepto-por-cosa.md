# ADR-0018: Un concepto por cosa en el esquema (revisión antes de la primera migración remota)

- Estado: Propuesto
- Fecha: 2026-10-27

## Contexto
Antes de aplicar la primera migración en Supabase, el propietario pidió una revisión completa: el esquema debe cubrir todas las funciones sin ser más complejo de lo necesario, para no tener que rehacerlo después. Al crecer por fases quedaron conceptos duplicados: objetivos y bolsillos, grupos de cuentas y bolsillos, escenarios con su propio libro, carteras modelo aparte de los activos, y el coste de un producto en dos sitios.

## Decisión
1. **Bolsillo = objetivo = grupo.** `pockets` absorbe `goals` (con `person_id` y `params`) y sustituye a `account_groups`. Se eliminan `goals`, `goal_accounts`, `account_groups` y `account_group_members`.
2. **Hipótesis = plan `what_if`.** `investment_plans.kind` distingue el calendario real (`schedule`) de una hipótesis (`what_if`), que nunca se activa ni se marca hecha y cuyo tipo es inmutable. Se eliminan `scenarios`, `scenario_operations` y `scenario_legs` (un segundo libro de patas sin cuadre en la base de datos).
3. **Alternativa = activo con ficha.** Una cartera o fondo con el que comparar se da de alta como activo (sin posiciones) con su composición y su ficha. Se eliminan `model_portfolios` y `model_portfolio_weights`.
4. **Ficha del producto con fuente.** `asset_fact_sheets` (TER, indicador de riesgo 1-7, peor caída con su periodo) es la única fuente de esos datos; salen de `assets` (`ter_bps`, `risk_indicator`, `equity_weight_bps`). El reparto de un mixto va en `asset_compositions`.
5. **Huecos funcionales cerrados:** reglas por producto (`advice_rules.scope = 'asset'`, la "justificación guardada" de una excepción); revisiones periódicas y listas de comprobación (`tasks.kind`, `tasks.checklist`); procedencia de los movimientos (`transactions.source`, `entered_by`) y de las valoraciones de extractos (`valuations.import_batch_id`); importación de PDF y borrado del original tras importar (`import_batches.file_kind`, `keep_original`, `original_deleted_at`).
6. **Higiene comprobada por tests de catálogo:** toda FK tiene un índice utilizable (un índice parcial solo vale si su condición es `columna IS NOT NULL`); no hay índices redundantes; ningún SQL dinámico en validaciones; textos libres etiquetados `[pii]`.

## Alternativas consideradas
- Mantener las tablas "por si acaso": más superficie de RLS, más tests y dos formas de hacer lo mismo en la interfaz, en contra de la regla 25.
- Modelar los escenarios como transacciones marcadas: mezcla datos reales e hipotéticos en el libro.

## Consecuencias
- (+) 34 tablas en `public` en lugar de 42; cada pregunta de la interfaz tiene una sola respuesta.
- (+) La migración inicial no tendrá que rehacerse por estos conceptos.
- (−) Una hipótesis con varias patas complejas se expresa con operaciones planificadas y repartos; si un día no basta, se amplía con una migración nueva.

# ADR-0016: Ingresos y gastos dentro del mismo libro de movimientos

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
El propietario quiere que la aplicación sirva también para el control de ingresos y gastos (petición del 26-10-2026). Estaba planificado para la fase 2 y con riesgo RGPD por las categorías especiales.

## Decisión
1. **Un gasto es un movimiento más** del libro de patas: `efectivo −X` / `externo +X`; un ingreso, `externo −X` / `efectivo +X`. Un traspaso entre cuentas propias no tiene pata externa, así que **no puede contarse como gasto**, ni el pago de una tarjeta duplicar gastos.
2. **La categoría va en la pata externa** (`transaction_legs.category_id`): un gasto se divide en varias categorías con varias patas; un reembolso es una pata negativa.
3. Tablas nuevas: `categories` (dos niveles, `essential` para el gasto básico), `category_budgets` (con vigencia mensual), `recurring_rules` (previsión, sin crear movimientos solos) y `categorization_rules` (reglas deterministas del usuario).
4. Informes en el servidor: `category_totals` y `monthly_cashflow`. Solo cuentan los tipos `income` y `expense`.
5. **Salvaguardas RGPD:** categorías elegidas por el usuario, semilla inicial sin categorías de salud, creencias o afiliaciones, sin inferencia automática, descripciones opcionales y acotadas. La EIPD se actualiza antes de la fase 2.

## Alternativas consideradas
- Un módulo de gastos separado del libro: duplica movimientos y permite confundir traspasos con gastos.
- Categorización automática o con IA: riesgo de inferir datos sensibles y de errores no explicables.

## Consecuencias
- (+) El colchón puede calcularse con el gasto básico **real**; la tasa de ahorro sale del mismo libro que el patrimonio.
- (−) Mucho más volumen de filas (miles al año): medido y dentro de lo razonable (ver `docs/plan/15-revision-bd.md`); el importador debe hacer `ANALYZE` tras cargas grandes.

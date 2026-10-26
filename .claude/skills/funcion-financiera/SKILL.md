---
name: funcion-financiera
description: Añade una función de cálculo financiero (rentabilidad, comisiones, proyecciones, hipoteca, escenarios) a packages/finance-core con aritmética exacta, explicación y tests de propiedades. Úsala para cualquier fórmula o cifra que muestre la aplicación.
---

# Nueva función de cálculo en `finance-core`

Contexto: `AGENTS.md` (reglas 13-19), ADR-0005 y ADR-0007, `docs/plan/05-calculos-financieros.md` (fórmulas y casos límite ya definidos).

## Reglas

- Pura y determinista: sin red, base de datos, reloj ni aleatoriedad no sembrada. La fecha de cálculo llega por parámetro.
- Importes `Money` (`bigint` + moneda); tipos, precios y cantidades `Decimal` (`dec("...")` desde cadena, nunca desde `number`). Nunca mezcles monedas sin `convert` con tipo y fecha.
- Un único punto de redondeo, con el modo explícito en la firma.
- Devuelve `{ value, explanation }` (método, entradas usadas, supuestos, calidad del dato) o `Result<T, DomainError>` para fallos esperables (sin datos, no converge). Los errores llevan un `code` estable para i18n.
- Si el resultado es una estimación o aproximación, la `explanation` lo dice (p. ej., "Dietz modificado: faltan valoraciones").

## Pasos

1. Escribe primero los **casos límite** del capítulo 5 del plan como tests de ejemplos (vacío, un solo flujo, periodo menor de un año, tasa cero, importes enormes).
2. Implementa en `packages/finance-core/src/<area>.ts` y expórtala en `src/index.ts`.
3. Añade **propiedades** con `fast-check` (1.000 ejecuciones) para los invariantes aplicables: conservación de totales, invariancia ante traspasos internos, escala (multiplicar flujos por k no cambia la tasa), ida y vuelta, monotonía.
4. Si hay una referencia externa (hoja de cálculo, simulador público), añade un *fixture* con su resultado y la tolerancia.
5. `pnpm --filter @mymoney/finance-core test` debe mantener **100 %** de líneas, ramas y funciones; `pnpm lint && pnpm typecheck` en verde.
6. Documenta la fórmula y sus supuestos en `docs/plan/05-calculos-financieros.md` si no estaba.

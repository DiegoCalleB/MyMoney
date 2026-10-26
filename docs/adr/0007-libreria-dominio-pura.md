# ADR-0007: Librería de dominio pura (`packages/finance-core`)

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
La lógica financiera es el corazón del producto y su parte más fácil de romper sin darse cuenta.

## Decisión
- Paquete TypeScript sin dependencias de UI, base de datos, red ni reloj; única dependencia de ejecución prevista: la librería decimal.
- Funciones deterministas que devuelven `{ value, explanation }` y `Result` para errores esperables.
- Tests: ejemplos + propiedades (fast-check) + *fixtures* de referencia externos + mutación (Stryker); cobertura 100 % exigida en CI.
- Se ejecuta en el servidor; puede ejecutarse en el cliente para simuladores interactivos sin datos sensibles adicionales.

## Alternativas consideradas
- Cálculos en SQL (funciones de Postgres): más cerca de los datos, pero más difíciles de probar con propiedades y de reutilizar; se reservan para agregados simples si el rendimiento lo exige.

## Consecuencias
- (+) Testeable, portable (otro *frontend* o un *worker*), revisable por terceros.
- (−) Hay que cargar los datos necesarios en memoria; aceptable a la escala prevista (miles de patas por espacio).

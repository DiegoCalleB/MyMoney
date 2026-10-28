# ADR-0005: Modelo de dinero, cantidades, tipos de cambio y fechas

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
Los cálculos de dinero no pueden tener errores de redondeo ni ambigüedad de moneda o fecha. JavaScript `number` es binario de coma flotante (0,1 + 0,2 ≠ 0,3).

## Decisión
- **Importes**: `bigint` en unidades mínimas de la moneda (céntimos para EUR) + `char(3)` ISO 4217. En TypeScript, `Money { minor: bigint; currency }`; operaciones solo entre la misma moneda.
- **Cantidades de activos**: `numeric(38,12)` (participaciones de fondos con 6+ decimales, cripto hasta 8 o más).
- **Precios**: `numeric(28,10)`. **Tipos de cambio**: `numeric(20,10)`, siempre con fecha (`as_of`) y fuente.
- **Porcentajes y umbrales**: puntos básicos en `integer`, o `numeric` para tasas calculadas.
- **Aritmética** en `finance-core` con una librería decimal de precisión arbitraria (candidata: decimal.js, 34 dígitos significativos) [verificar en la fase 0]. Redondeo explícito solo al convertir a unidades mínimas: `HALF_EVEN` interno, `HALF_UP` para presentar.
- **Reparto** de importes con el método del resto mayor (sin perder céntimos).
- **Fechas**: `date` para fechas contables; `timestamptz` para sellos técnicos; zona IANA por espacio. Tipo de cambio aplicable = el último publicado ≤ fecha de la operación.
- Transporte JSON: `bigint` y `numeric` serializados como **cadenas**, nunca como números.

## Alternativas consideradas
- `numeric(19,4)` para todo: válido, pero ensombrece la moneda y obliga a redondear en cada consulta; `bigint` hace explícitas las unidades mínimas.
- Floats con redondeo al mostrar: inaceptable.

## Consecuencias
- (+) Exactitud y trazabilidad.
- (−) Más disciplina de tipos; conversión en los bordes (PostgREST devuelve `bigint` como número JSON si no se castea: se usarán vistas/RPC que devuelvan texto o se validará que el rango quepa en 2^53).

# ADR-0022: Rentabilidad calculada desde el libro y las valoraciones

- Estado: Propuesto
- Fecha: 2026-10-28

## Contexto
La iteración 2 de la fase 1 pide responder "¿me está yendo bien?": aportado frente a ganado, rentabilidad por dinero (XIRR), por tiempo (TWR) y real frente al IPC. El libro (ADR-0006) distingue traspasos de aportaciones, pero faltaba el puente entre sus patas y las funciones de rentabilidad.

## Decisión
1. **Qué es un flujo.** Respecto a un conjunto de cuentas, flujo = lo que entra o sale de ese conjunto: las patas `external` y las de cuentas de fuera. Un traspaso entre cuentas del mismo conjunto no es flujo; uno hacia fuera sí. Comisiones e impuestos **no** son flujo (restan rentabilidad); dividendos, intereses y ajustes tampoco (son rendimiento). Vive en `finance-core` (`externalFlows`), no en SQL.
2. **Una valoración incluye los movimientos de su día.** Para el TWR, los tramos entre dos valoraciones sin flujos intermedios son exactos; con flujos intermedios se usa Dietz modificado y el resultado se marca como aproximado. Un tramo sin base de cálculo se omite y el resultado pasa a "parcial".
3. **Serie de valor de un conjunto** (`valueSeries`): en cada fecha, cada cuenta vale su última valoración más los flujos posteriores a ella; antes de su primera valoración vale lo aportado (coste), con aviso. Así un traspaso entre cuentas no cambia el total.
4. **XIRR**: Newton con respaldo en bisección; tolerancia relativa 1e-10 sobre la suma de flujos; avisa si hay varias raíces; el −100 % se devuelve sin resolver. En periodos menores de un año `annualizedReliable = false` y la interfaz muestra la acumulada.
5. **Rentabilidad real** por cociente, con IPC mensual interpolado linealmente dentro del mes y último dato publicado cuando el periodo lo supera (se avisa).
6. **Lectura desde la web** mediante la función `return_legs` (security invoker, solo movimientos liquidados): devuelve todas las patas de los movimientos que tocan las cuentas pedidas. La web la pagina de 1.000 en 1.000.
7. **Alcance de la pantalla**: solo cuentas de inversión (fondos, brókeres, planes de pensiones, cripto, depósitos, ahorro, inmuebles y otros bienes), por cuenta y para el conjunto. Las corrientes y las deudas no tienen rentabilidad que comparar.

## Alternativas consideradas
- Calcular los flujos en SQL: duplicaría reglas que ya viven en `finance-core` y no tendría tests de propiedades.
- Tratar los dividendos como aportaciones: inflaría lo aportado y bajaría la rentabilidad.
- Interpolar valores entre valoraciones para tener TWR exacto: inventaría datos; se prefiere la aproximación declarada.

## Consecuencias
- (+) Cada cifra lleva método, supuestos, calidad del dato y avisos.
- (+) `finance-core` mantiene el 100 % de cobertura, con propiedades (escala, ida y vuelta, TWR = XIRR sin flujos, independencia del importe aportado).
- (−) La IPC y los tipos de cambio históricos deben estar cargados (`inflation_index`, `fx_rates`); sin ellos la real o la conversión se omiten y se dice por qué.
- (−) Pendiente: rentabilidad por bolsillo (ADR-0019), valoración por posiciones y la carga automática del IPC del INE.

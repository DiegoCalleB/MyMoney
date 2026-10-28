# ADR-0006: Transacciones con patas (partida doble ligera)

- Estado: Propuesto
- Fecha: 2026-10-26

## Contexto
La rentabilidad depende de distinguir flujos **externos** (aportaciones, retiradas) de **internos** (traspasos entre cuentas propias, compras dentro de un bróker). Un modelo de "movimiento con importe y tipo" mezcla ambos y produce rentabilidades falsas.

## Decisión
- `transactions` (cabecera: tipo, fecha, descripción) + `transaction_legs` (patas: cuenta, rol `cash|position|external|fee|tax`, activo, cantidad, importe, moneda).
- Invariante: por transacción y moneda, la suma de importes de las patas es 0 (*constraint trigger* diferido + validación en `finance-core`).
- Los flujos externos de un ámbito (cuenta, grupo o espacio) se derivan de las patas: los que cruzan el borde del ámbito.
- Las valoraciones no son transacciones: viven en `valuations` y `ref.prices`.
- Las correcciones se hacen con transacciones inversas enlazadas; edición/borrado directo solo en las primeras 24 h.

## Alternativas consideradas
- Contabilidad de partida doble completa (plan de cuentas, debe/haber): más rigor del necesario y más fricción para el usuario.
- Movimientos simples con un indicador "es traspaso": frágil; cada lado se edita por separado y descuadra.

## Consecuencias
- (+) Rentabilidades correctas por construcción; conciliación posible; base para lotes fiscales.
- (−) La UI debe esconder las patas tras formularios por tipo de operación.

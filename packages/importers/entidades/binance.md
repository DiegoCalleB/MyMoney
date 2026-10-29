# Plantilla de Binance

- **Estado: sin verificar** (`verified: false`). Última comprobación pública: 2026-10-28.
- **Cómo se descarga:** historial de transacciones → Exportar (CSV por tramos de hasta 3 meses; el mismo archivo no debe re-guardarse en una hoja de cálculo).
- **Columnas que exige la plantilla:** `UTC_Time`, `Operation`, `Coin`, `Change` (y `Remark` como concepto). Fechas `AAAA-MM-DD hh:mm:ss`, decimal con punto.
- **Qué importa:** `Deposit` (aportación) y `Withdraw` (retirada) cuando `Coin` es la moneda de la cuenta (p. ej., EUR).
- **Qué omite a propósito:** el resto de operaciones y todo movimiento en criptoactivos; se cuentan y se muestran. El valor de las criptomonedas sale de precios (`ref.prices`), no de sumar movimientos.
- **Limitación:** sin identificador de operación, la huella es la de ADR-0008 (fecha, importe, concepto y ordinal).
- **API de solo lectura:** ver `docs/plan/16-integraciones.md` (paso I-4).

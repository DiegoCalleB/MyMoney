# Plantilla de Trade Republic

- **Estado: sin verificar** (`verified: false`). Última comprobación pública: 2026-10-28. Pendiente de contrastar con un archivo real (la cabecera, no los importes).
- **Cómo se descarga:** app web de Trade Republic → Servicio → Extractos → Transaktionsexport (la ruta exacta varía según la fuente); elegir el periodo más largo. Disponible desde el 15-04-2026 según fuentes de terceros.
- **Columnas que exige la plantilla:** `date`, `type`, `amount`, `currency`, `transaction_id` (más `name` y `description` si existen, para el concepto). Fechas ISO (`AAAA-MM-DD`), decimal con punto.
- **Qué importa:** aportaciones (`CUSTOMER_INBOUND`), retiradas (`CUSTOMER_OUTBOUND`), dividendos (`DIVIDEND`) e intereses (`INTEREST_PAYMENT`) en la moneda de la cuenta. El signo lo da el tipo, no el archivo.
- **Qué omite a propósito:** compras y ventas (`BUY`, `SELL`: no cruzan el borde del espacio, ADR-0006) y filas en otra moneda; se cuentan y se muestran.
- **Qué marca como error:** cualquier otro tipo de operación (tarjeta, staking, correcciones…), para que se vea y no se pierda en silencio.
- **Idempotencia:** la huella es el `transaction_id` de la entidad (ADR-0008, punto 3).
- **Cómo verificarla:** pásame solo la fila de cabecera y los valores distintos de la columna `type`, sin importes ni nombres. Si difieren, se corrige `src/entities.ts` y se pone `verified: true`.

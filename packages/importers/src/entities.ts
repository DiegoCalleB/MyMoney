import type { EntityTemplate } from "./templates";

/**
 * Plantillas de entidades (skill `importador-entidad`). Ninguna está contrastada todavía con un
 * archivo real, así que todas llevan `verified: false` y la interfaz pide revisar la vista previa.
 * Los nombres de columna salen de descripciones públicas del formato [A VERIFICAR]: si no
 * coinciden con tu archivo, la plantilla no se aplica y se usa el detector genérico.
 *
 * Por diseño solo importan flujos de efectivo con el exterior (aportaciones, retiradas,
 * dividendos, intereses). Las compras y ventas dentro de la entidad no cruzan el borde del
 * espacio (ADR-0006): el valor de las posiciones sale de las valoraciones y los precios.
 */

/** Trade Republic: exportación de transacciones (Servicio → Extractos → Transaktionsexport). */
export const TRADE_REPUBLIC: EntityTemplate = {
  id: "trade_republic",
  label: "Trade Republic",
  verified: false,
  requiredHeaders: ["date", "type", "amount", "currency", "transaction_id"],
  dateColumn: "date",
  dateFormat: "ymd",
  amountColumn: "amount",
  numberFormat: "en",
  kindColumn: "type",
  kinds: {
    customer_inbound: "contribution",
    customer_outbound: "withdrawal",
    dividend: "dividend",
    interest_payment: "interest",
    buy: "skip",
    sell: "skip",
  },
  unknownKind: "error",
  descriptionColumns: ["name", "description"],
  idColumn: "transaction_id",
  currencyColumn: "currency",
};

/** Binance: historial de transacciones (Pedidos → Historial de transacciones → Exportar). */
export const BINANCE: EntityTemplate = {
  id: "binance",
  label: "Binance",
  verified: false,
  requiredHeaders: ["utc_time", "operation", "coin", "change"],
  dateColumn: "utc_time",
  dateFormat: "ymd",
  amountColumn: "change",
  numberFormat: "en",
  kindColumn: "operation",
  kinds: {
    deposit: "contribution",
    withdraw: "withdrawal",
  },
  // El historial trae decenas de operaciones (comisiones, recompensas, compras…) y casi todas
  // ocurren en criptoactivos; solo cuentan los depósitos y retiradas en la moneda de la cuenta.
  unknownKind: "skip",
  descriptionColumns: ["remark"],
  idColumn: null,
  currencyColumn: "coin",
};

export const ENTITY_TEMPLATES: readonly EntityTemplate[] = [TRADE_REPUBLIC, BINANCE];

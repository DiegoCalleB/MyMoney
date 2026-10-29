import type { CalendarDate, CurrencyCode } from "@mymoney/finance-core";
import type { FlowKind, NormalizedRow } from "./rows";

export interface LegPayload {
  readonly role: "cash" | "external";
  readonly account_id: string | null;
  /** Categoría del espacio (solo en la pata externa). */
  readonly category_id?: string;
  /** bigint como texto, como espera `create_transaction`. */
  readonly amount_minor: string;
  readonly currency: CurrencyCode;
}

export interface TransactionPayload {
  readonly kind: FlowKind;
  readonly occurredOn: CalendarDate;
  readonly description: string | null;
  readonly legs: readonly [LegPayload, LegPayload];
}

/**
 * Un apunte de cuenta como ingreso o gasto sin categoría: una pata de efectivo en la cuenta y
 * una pata externa de signo contrario, de modo que cuadra por moneda (ADR-0006). Una plantilla de
 * entidad puede fijar el tipo (aportación, retirada, dividendo, interés). Los traspasos
 * entre cuentas propias no se detectan: aparecen como ingreso y gasto.
 */
export function toTransactionPayload(row: NormalizedRow, accountId: string): TransactionPayload {
  const { minor, currency } = row.amount;
  return {
    kind: row.kind ?? (minor > 0n ? "income" : "expense"),
    occurredOn: row.date,
    description: row.description === "" ? null : row.description,
    legs: [
      { role: "cash", account_id: accountId, amount_minor: minor.toString(), currency },
      { role: "external", account_id: null, amount_minor: (-minor).toString(), currency },
    ],
  };
}

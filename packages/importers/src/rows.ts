import {
  money as toMoney,
  parseLocalizedAmount,
  type CalendarDate,
  type CurrencyCode,
  type Money,
} from "@mymoney/finance-core";
import { cleanAmount, normalizeText, parseDateCell, type ColumnMapping } from "./columns";

export interface NormalizedRow {
  /** Posición de la fila entre las de datos, empezando en 1 (sin cabecera ni líneas vacías). */
  readonly index: number;
  readonly date: CalendarDate;
  /** Concepto con espacios simples y como máximo 200 caracteres. */
  readonly description: string;
  /** Con signo: positivo entra dinero, negativo sale. */
  readonly amount: Money;
  /** Saldo tras el apunte, si el extracto lo trae. */
  readonly balanceAfter: Money | null;
}

export interface RowError {
  readonly index: number;
  readonly code:
    | "row.too_short"
    | "row.date_invalid"
    | "row.amount_invalid"
    | "row.amount_missing"
    | "row.amount_ambiguous"
    | "row.amount_zero"
    | "row.amount_too_large"
    | "row.balance_invalid";
}

export const MAX_DESCRIPTION_LENGTH = 200;
/** Igual que la restricción de `transaction_legs.amount_minor`. */
const MAX_MINOR = 10n ** 15n;

export function cleanDescription(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

/** Valor absoluto de un bigint. */
function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

type Parsed = { readonly ok: true; readonly money: Money | null } | { readonly ok: false };

function parseCell(text: string, mapping: ColumnMapping, currency: CurrencyCode): Parsed {
  const cleaned = cleanAmount(text, mapping.numberFormat);
  if (cleaned === null) return { ok: true, money: null };
  const money = parseLocalizedAmount(cleaned, currency);
  return money ? { ok: true, money } : { ok: false };
}

/** Una fila normalizada o el código de por qué no se entiende. */
function normalizeRow(
  cells: readonly string[],
  index: number,
  mapping: ColumnMapping,
  currency: CurrencyCode,
): NormalizedRow | RowError["code"] {
  const dateText = cells[mapping.dateColumn];
  if (dateText === undefined) return "row.too_short";
  const date = parseDateCell(dateText, mapping.dateFormat);
  if (!date) return "row.date_invalid";

  let amount: Money | null;
  if (mapping.amount.kind === "single") {
    const text = cells[mapping.amount.column];
    if (text === undefined) return "row.too_short";
    const parsed = parseCell(text, mapping, currency);
    if (!parsed.ok) return "row.amount_invalid";
    amount = parsed.money;
  } else {
    const debitText = cells[mapping.amount.debitColumn];
    const creditText = cells[mapping.amount.creditColumn];
    if (debitText === undefined || creditText === undefined) return "row.too_short";
    const debit = parseCell(debitText, mapping, currency);
    const credit = parseCell(creditText, mapping, currency);
    if (!debit.ok || !credit.ok) return "row.amount_invalid";
    if (debit.money && credit.money && debit.money.minor !== 0n && credit.money.minor !== 0n) {
      return "row.amount_ambiguous";
    }
    const net = (credit.money?.minor ?? 0n) - absolute(debit.money?.minor ?? 0n);
    amount = debit.money || credit.money ? toMoney(net, currency) : null;
  }
  if (amount === null) return "row.amount_missing";
  if (amount.minor === 0n) return "row.amount_zero";
  if (amount.minor > MAX_MINOR || amount.minor < -MAX_MINOR) return "row.amount_too_large";

  let balanceAfter: Money | null = null;
  if (mapping.balanceColumn !== null) {
    const parsed = parseCell(cells[mapping.balanceColumn] ?? "", mapping, currency);
    if (!parsed.ok) return "row.balance_invalid";
    balanceAfter = parsed.money;
  }

  const description =
    mapping.descriptionColumn === null
      ? ""
      : cleanDescription(cells[mapping.descriptionColumn] ?? "");
  return { index, date, description, amount, balanceAfter };
}

/**
 * Convierte las filas de datos en movimientos normalizados. Una fila que no se entiende no se
 * descarta en silencio: sale en `errors` con su posición y un código estable.
 */
export function normalizeRows(
  data: readonly (readonly string[])[],
  mapping: ColumnMapping,
  currency: CurrencyCode,
): { rows: NormalizedRow[]; errors: RowError[] } {
  const rows: NormalizedRow[] = [];
  const errors: RowError[] = [];
  data.forEach((cells, position) => {
    const index = position + 1;
    const result = normalizeRow(cells, index, mapping, currency);
    if (typeof result === "string") errors.push({ index, code: result });
    else rows.push(result);
  });
  return { rows, errors };
}

/** Texto comparable de un concepto, para las huellas. */
export function descriptionKey(description: string): string {
  return normalizeText(description);
}

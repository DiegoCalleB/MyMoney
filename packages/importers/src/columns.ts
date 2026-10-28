import { calendarDate, isCalendarDate, type CalendarDate } from "@mymoney/finance-core";

export type DateFormat = "dmy" | "ymd";
/** "es": 1.234,56. "en": 1,234.56. */
export type NumberFormat = "es" | "en";

export type AmountColumns =
  | { readonly kind: "single"; readonly column: number }
  | { readonly kind: "split"; readonly debitColumn: number; readonly creditColumn: number };

/** Qué columna es cada cosa y cómo se escriben fechas e importes en este archivo. */
export interface ColumnMapping {
  readonly dateColumn: number;
  readonly dateFormat: DateFormat;
  readonly descriptionColumn: number | null;
  readonly amount: AmountColumns;
  readonly balanceColumn: number | null;
  readonly numberFormat: NumberFormat;
}

/** Minúsculas, sin tildes y con espacios simples: para comparar cabeceras y descripciones. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const DATE_HEADERS = [
  "fecha operacion",
  "fecha de operacion",
  "fecha contable",
  "booking date",
  "transaction date",
  "fecha",
  "date",
];
const DESCRIPTION_HEADERS = [
  "concepto",
  "descripcion",
  "detalle",
  "movimiento",
  "description",
  "referencia",
  "reference",
  "beneficiario",
  "payee",
];
const AMOUNT_HEADERS = ["importe", "amount", "cantidad", "monto"];
const DEBIT_HEADERS = ["debe", "cargo", "debit", "salida", "retirada"];
const CREDIT_HEADERS = ["haber", "abono", "credit", "entrada", "ingreso"];
const BALANCE_HEADERS = ["saldo", "balance"];

function findColumn(
  headers: readonly string[],
  patterns: readonly string[],
  taken: ReadonlySet<number>,
): number | null {
  for (const pattern of patterns) {
    const index = headers.findIndex((h, i) => !taken.has(i) && h.includes(pattern));
    if (index !== -1) return index;
  }
  return null;
}

const ISO_LIKE = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/;
const DAY_FIRST = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/;

function inferDateFormat(samples: readonly string[]): DateFormat | null {
  const iso = samples.filter((s) => ISO_LIKE.test(s.trim())).length;
  const dmy = samples.filter((s) => DAY_FIRST.test(s.trim())).length;
  if (iso === 0 && dmy === 0) return null;
  return iso > dmy ? "ymd" : "dmy";
}

// Coma como separador de miles ("1,234.56" o "1,234"), frente a coma decimal ("1.234,56", "12,5").
const COMMA_THOUSANDS = /^\D*\d{1,3}(,\d{3})+(\.\d+)?\D*$/;
const COMMA_DECIMAL = /,\d{1,2}\D*$/;

function inferNumberFormat(samples: readonly string[]): NumberFormat {
  const compact = samples.map((s) => s.replace(/\s/g, ""));
  const english = compact.some((s) => COMMA_THOUSANDS.test(s));
  const spanish = compact.some((s) => COMMA_DECIMAL.test(s));
  return english && !spanish ? "en" : "es";
}

function column(rows: readonly (readonly string[])[], index: number): string[] {
  return rows.map((r) => r[index] ?? "").filter((cell) => cell.trim() !== "");
}

/**
 * Propone el mapeo de columnas a partir de la cabecera (primera fila) y de las primeras filas.
 * Devuelve `null` si no encuentra fecha e importe: entonces hay que elegirlo a mano.
 */
export function detectMapping(rows: readonly (readonly string[])[]): ColumnMapping | null {
  const [headerRow, ...data] = rows;
  if (!headerRow) return null;
  const headers = headerRow.map(normalizeText);
  const taken = new Set<number>();
  const take = (index: number | null): number | null => {
    if (index !== null) taken.add(index);
    return index;
  };

  const dateColumn = take(findColumn(headers, DATE_HEADERS, taken));
  if (dateColumn === null) return null;
  const dateFormat = inferDateFormat(column(data.slice(0, 50), dateColumn));
  if (dateFormat === null) return null;

  let amount: AmountColumns;
  const single = take(findColumn(headers, AMOUNT_HEADERS, taken));
  if (single !== null) {
    amount = { kind: "single", column: single };
  } else {
    const debitColumn = findColumn(headers, DEBIT_HEADERS, taken);
    if (debitColumn !== null) taken.add(debitColumn);
    const creditColumn = findColumn(headers, CREDIT_HEADERS, taken);
    if (debitColumn === null || creditColumn === null) return null;
    taken.add(creditColumn);
    amount = { kind: "split", debitColumn, creditColumn };
  }

  const balanceColumn = take(findColumn(headers, BALANCE_HEADERS, taken));
  const descriptionColumn = take(findColumn(headers, DESCRIPTION_HEADERS, taken));

  const amountColumns =
    amount.kind === "single" ? [amount.column] : [amount.debitColumn, amount.creditColumn];
  const numeric = [...amountColumns, ...(balanceColumn === null ? [] : [balanceColumn])];
  const samples = numeric.flatMap((c) => column(data.slice(0, 50), c));

  return {
    dateColumn,
    dateFormat,
    descriptionColumn,
    amount,
    balanceColumn,
    numberFormat: inferNumberFormat(samples),
  };
}

/** Comprueba que un mapeo (p. ej., elegido a mano) apunta a columnas que existen. */
export function isValidMapping(mapping: ColumnMapping, columnCount: number): boolean {
  const indexes = [
    mapping.dateColumn,
    ...(mapping.descriptionColumn === null ? [] : [mapping.descriptionColumn]),
    ...(mapping.balanceColumn === null ? [] : [mapping.balanceColumn]),
    ...(mapping.amount.kind === "single"
      ? [mapping.amount.column]
      : [mapping.amount.debitColumn, mapping.amount.creditColumn]),
  ];
  return indexes.every((i) => Number.isInteger(i) && i >= 0 && i < columnCount);
}

/** Fecha de una celda ("27/10/2026", "2026-10-27", con o sin hora). Años de dos cifras: no. */
export function parseDateCell(text: string, format: DateFormat): CalendarDate | null {
  const match =
    format === "ymd"
      ? /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT].*)?$/.exec(text.trim())
      : /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT].*)?$/.exec(text.trim());
  if (!match) return null;
  const [, first = "", second = "", third = ""] = match;
  const [year, month, day] = format === "ymd" ? [first, second, third] : [third, second, first];
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isCalendarDate(iso) ? calendarDate(iso) : null;
}

/**
 * Deja un importe en la forma que entiende `parseLocalizedAmount`: sin símbolos de moneda,
 * con signo delante y, si el archivo usa comas de millar, sin ellas. `null` si está vacío.
 */
export function cleanAmount(text: string, format: NumberFormat): string | null {
  let value = text.replace(/\s/g, "").replace(/[€$£]|EUR|USD|GBP/gi, "");
  if (value === "") return null;
  let negative = false;
  if (value.startsWith("(") && value.endsWith(")")) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.endsWith("-")) {
    negative = true;
    value = value.slice(0, -1);
  }
  if (value.startsWith("-")) {
    negative = true;
    value = value.slice(1);
  } else if (value.startsWith("+")) {
    value = value.slice(1);
  }
  if (format === "en") value = value.replace(/,/g, "");
  return negative ? `-${value}` : value;
}

import {
  addDays,
  calendarDate,
  money,
  type CalendarDate,
  type CurrencyCode,
  type Money,
} from "@mymoney/finance-core";
import { buildSlices, type Slice } from "@/server/chart-model";

export interface CategoryTotalRow {
  readonly category_id: string | null;
  readonly flow: "income" | "expense";
  readonly currency: CurrencyCode;
  readonly amount_minor: bigint;
}

export interface MonthlyRow {
  readonly month: CalendarDate;
  readonly currency: CurrencyCode;
  readonly income_minor: bigint;
  readonly expense_minor: bigint;
}

export interface SpendMonth {
  readonly key: string;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
}

/** Primer y último día del mes `AAAA-MM` (ya validado). */
export function buildMonth(key: string): SpendMonth {
  const next = shiftMonth(key, 1);
  return { key, from: calendarDate(`${key}-01`), to: addDays(calendarDate(`${next}-01`), -1) };
}

/** `AAAA-MM` → su mes; `null` si no es un mes válido. */
export function parseMonth(value: string | undefined): SpendMonth | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? buildMonth(value) : null;
}

/** Mes (`AAAA-MM`) desplazado `delta` meses. */
export function shiftMonth(key: string, delta: number): string {
  const index = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + delta;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export interface SpendSummary {
  readonly expense: Money;
  readonly income: Money;
  readonly saved: Money;
  readonly slices: readonly Slice[];
  /** Todas las categorías de gasto, de más a menos, para la lista completa. */
  readonly categories: readonly { key: string; label: string; value: Money; shareBps: number }[];
}

/**
 * Resume el mes en la moneda base: gasto e ingreso totales y el gasto por categoría. Los
 * reembolsos ya vienen restados de su categoría; una categoría que queda en cero o negativa no
 * se dibuja. Las monedas distintas de la base no se mezclan: se ignoran aquí.
 */
export function summarizeMonth(
  rows: readonly CategoryTotalRow[],
  names: ReadonlyMap<string, string>,
  currency: CurrencyCode,
  labels: { uncategorized: string; other: string },
): SpendSummary {
  const own = rows.filter((r) => r.currency === currency);
  const sum = (flow: "income" | "expense") =>
    own.filter((r) => r.flow === flow).reduce((n, r) => n + r.amount_minor, 0n);
  const expense = sum("expense");
  const income = sum("income");
  const items = own
    .filter((r) => r.flow === "expense")
    .map((r) => ({
      key: r.category_id ?? "none",
      label: r.category_id
        ? (names.get(r.category_id) ?? labels.uncategorized)
        : labels.uncategorized,
      value: money(r.amount_minor, currency),
    }));
  const slices = buildSlices(items, { max: 7, otherLabel: labels.other });
  const total = items.filter((i) => i.value.minor > 0n).reduce((n, i) => n + i.value.minor, 0n);
  const categories = [...items]
    .filter((i) => i.value.minor > 0n)
    .sort((a, b) => (a.value.minor === b.value.minor ? 0 : a.value.minor > b.value.minor ? -1 : 1))
    .map((i) => ({ ...i, shareBps: Number((i.value.minor * 10000n) / total) }));
  return {
    expense: money(expense, currency),
    income: money(income, currency),
    saved: money(income - expense, currency),
    slices,
    categories,
  };
}

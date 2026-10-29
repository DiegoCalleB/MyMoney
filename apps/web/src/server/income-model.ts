import {
  incomeCalendar,
  money,
  type CalendarDate,
  type CurrencyCode,
  type IncomeEvent,
  type IncomeResult,
  type Money,
} from "@mymoney/finance-core";
import type { IncomeEventRow } from "@/server/home-model";

export interface IncomeModel {
  readonly currency: CurrencyCode;
  readonly result: IncomeResult;
  /** Cobros en otra moneda: no se suman sin conversión (regla 14) y se avisa de cuántos son. */
  readonly ignored: number;
}

/**
 * Calendario de cobros del hogar en la moneda base. Solo cuentan las cuentas del hogar que no son
 * deudas; los cobros en otra moneda se dejan fuera y se cuentan. `null` si no hay ningún cobro en
 * la moneda base: la pantalla muestra entonces cómo empezar.
 */
export function buildIncome(
  rows: readonly IncomeEventRow[],
  accountIds: ReadonlySet<string>,
  baseCurrency: CurrencyCode,
  portfolioValue: Money | null,
  today: CalendarDate,
  months: number,
): IncomeModel | null {
  const relevant = rows.filter((r) => accountIds.has(r.account_id));
  const events: IncomeEvent[] = relevant
    .filter((r) => r.currency === baseCurrency)
    .map((r) => ({
      date: r.occurred_on,
      kind: r.kind,
      amount: money(r.amount_minor, baseCurrency),
    }));
  if (events.length === 0) return null;
  const result = incomeCalendar({
    currency: baseCurrency,
    events,
    months,
    portfolioValue,
    onDate: today,
  });
  // Las monedas ya están filtradas y los meses los fija el llamante: solo falla un código de programación.
  if (!result.ok) throw new Error(result.error.code);
  return { currency: baseCurrency, result: result.value, ignored: relevant.length - events.length };
}

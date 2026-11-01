import { netWorth, money, type CalendarDate, type Money } from "@mymoney/finance-core";
import { buildHomeModel, type HomeRows } from "@/server/home-model";
import { buildMonth, shiftMonth } from "@/server/spend-model";

/**
 * Evolución del patrimonio: el patrimonio a final de cada uno de los últimos meses, calculado con
 * las valoraciones vigentes en esa fecha (la última de cada cuenta hasta entonces) y el mismo
 * cálculo que el patrimonio de hoy. Es una aproximación honesta: una cuenta sin valoración aún no
 * cuenta, y los movimientos posteriores a una valoración no se aplican hacia atrás.
 */
export interface HistoryPoint {
  readonly date: CalendarDate;
  readonly total: Money;
}

type HistoryRows = Pick<HomeRows, "space" | "accounts" | "valuations" | "fxRates">;

/** Finales de mes de los `months` meses anteriores al actual, más hoy. */
export function historyDates(today: CalendarDate, months = 12): CalendarDate[] {
  const current = today.slice(0, 7);
  const ends = Array.from(
    { length: months },
    (_, i) => buildMonth(shiftMonth(current, i - months)).to,
  );
  return [...ends, today];
}

/** Patrimonio en cada fecha; las fechas en las que aún no había ninguna valoración se omiten. */
export function buildNetWorthHistory(
  rows: HistoryRows,
  today: CalendarDate,
  months = 12,
): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  for (const date of historyDates(today, months)) {
    const model = buildHomeModel({ ...rows, balances: [], allocations: [] }, date);
    // Sin ninguna valoración ya vigente no hay nada que sumar: es «sin datos», no «cero».
    if (!model.input.accounts.some((a) => a.valuation)) continue;
    points.push({ date, total: netWorth(model.input).value.total });
  }
  return points;
}

export interface Change {
  /** Fecha del punto con el que se compara. */
  readonly since: CalendarDate;
  readonly delta: Money;
  /** Variación sobre ese punto en puntos básicos; `null` si partía de cero o menos. */
  readonly bps: bigint | null;
}

/** Cambio entre el último cierre de mes anterior a hoy y el patrimonio actual. */
export function changeSinceLastClose(
  history: readonly HistoryPoint[],
  current: Money,
  today: CalendarDate,
): Change | null {
  const month = today.slice(0, 7);
  const base = [...history].reverse().find((p) => p.date.slice(0, 7) < month);
  if (!base || base.total.currency !== current.currency) return null;
  const delta = money(current.minor - base.total.minor, current.currency);
  return {
    since: base.date,
    delta,
    bps: base.total.minor > 0n ? (delta.minor * 10_000n) / base.total.minor : null,
  };
}

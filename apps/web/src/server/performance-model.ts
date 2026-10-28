import {
  addDays,
  calendarDate,
  money,
  performanceSeries,
  type CalendarDate,
  type CurrencyCode,
  type DomainError,
  type ExternalFlow,
  type Performance,
  type Result,
  type ValuePoint,
} from "@mymoney/finance-core";
import type { ExternalFlowRow } from "@/server/home-model";

export const PERIODS = ["1m", "6m", "1a", "2a", "ytd", "todo"] as const;
export type PeriodKey = (typeof PERIODS)[number];

export function isPeriod(value: string | undefined): value is PeriodKey {
  return PERIODS.some((p) => p === value);
}

/** Inicio de la ventana visible para cada periodo; `null` = todo el histórico. */
export function periodStart(period: PeriodKey, today: CalendarDate): CalendarDate | null {
  switch (period) {
    case "1m":
      return addDays(today, -30);
    case "6m":
      return addDays(today, -182);
    case "1a":
      return addDays(today, -365);
    case "2a":
      return addDays(today, -730);
    case "ytd":
      return calendarDate(`${today.slice(0, 4)}-01-01`);
    case "todo":
      return null;
  }
}

export interface PerfAccount {
  readonly id: string;
  readonly name: string;
  readonly currency: CurrencyCode;
}

export interface PerfValuationRow {
  readonly account_id: string;
  readonly as_of: CalendarDate;
  readonly value_minor: bigint;
  readonly currency: CurrencyCode;
}

export const TOTAL_ID = "total";

export interface PerformanceOption {
  readonly id: string;
  readonly name: string;
}

export interface PerformanceModel {
  /** Total (si hay más de una cuenta en moneda base) y cada cuenta con aportaciones. */
  readonly options: readonly PerformanceOption[];
  readonly selected: string;
  readonly currency: CurrencyCode;
  readonly result: Result<Performance, DomainError>;
}

/**
 * Valores del conjunto: en cada fecha con valoración de alguna cuenta, la suma de lo último
 * valorado de cada una hasta entonces (una cuenta aún sin valorar no suma). Solo cuentas de la
 * moneda indicada: nunca se mezclan monedas.
 */
export function combineValuations(
  perAccount: readonly (readonly ValuePoint[])[],
  currency: CurrencyCode,
): ValuePoint[] {
  const dates = [...new Set(perAccount.flatMap((s) => s.map((p) => p.date)))].sort();
  return dates.map((date) => {
    let minor = 0n;
    for (const series of perAccount) {
      let last: ValuePoint | undefined;
      for (const p of series) {
        if (p.date > date) break;
        last = p;
      }
      if (last) minor += last.value.minor;
    }
    return { date, value: money(minor, currency) };
  });
}

/** Prepara la serie de rentabilidad de una cuenta o del total, para el periodo elegido. */
export function buildPerformance(
  accounts: readonly PerfAccount[],
  valuationRows: readonly PerfValuationRow[],
  flowRows: readonly ExternalFlowRow[],
  baseCurrency: CurrencyCode,
  requested: string | undefined,
  period: PeriodKey,
  today: CalendarDate,
): PerformanceModel {
  const withFlows = accounts.filter((a) =>
    flowRows.some((f) => f.account_id === a.id && f.currency === a.currency),
  );
  const valuesOf = (a: PerfAccount): ValuePoint[] =>
    valuationRows
      .filter((v) => v.account_id === a.id && v.currency === a.currency)
      .sort((x, y) => (x.as_of < y.as_of ? -1 : 1))
      .map((v) => ({ date: v.as_of, value: money(v.value_minor, v.currency) }));
  const flowsOf = (a: PerfAccount): ExternalFlow[] =>
    flowRows
      .filter((f) => f.account_id === a.id && f.currency === a.currency)
      .map((f) => ({ date: f.occurred_on, amount: money(f.amount_minor, f.currency) }));

  const inBase = withFlows.filter((a) => a.currency === baseCurrency);
  const options: PerformanceOption[] = [
    ...(inBase.length > 1 ? [{ id: TOTAL_ID, name: "total" }] : []),
    ...withFlows.map((a) => ({ id: a.id, name: a.name })),
  ];
  const fallback = options[0]?.id ?? TOTAL_ID;
  const selected = options.some((o) => o.id === requested) ? (requested ?? fallback) : fallback;
  const from = periodStart(period, today);

  if (selected === TOTAL_ID) {
    return {
      options,
      selected,
      currency: baseCurrency,
      result: performanceSeries({
        currency: baseCurrency,
        valuations: combineValuations(inBase.map(valuesOf), baseCurrency),
        flows: inBase.flatMap(flowsOf),
        from,
        onDate: today,
      }),
    };
  }
  const account = withFlows.find((a) => a.id === selected);
  const currency = account?.currency ?? baseCurrency;
  return {
    options,
    selected,
    currency,
    result: account
      ? performanceSeries({
          currency,
          valuations: valuesOf(account),
          flows: flowsOf(account),
          from,
          onDate: today,
        })
      : { ok: false, error: { code: "performance.no_flows" } },
  };
}

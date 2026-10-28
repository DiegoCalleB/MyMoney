import { addDays, compareDates, daysBetween, type CalendarDate } from "./calendar-date";
import { Decimal, dec } from "./decimal";
import { annualize, isAnnualizedReliable, type ReturnQuality } from "./returns";
import { err, ok, type DomainError, type Result } from "./result";

/** Índice de precios (IPC del INE) de un mes. `month` = "2026-08". */
export interface CpiPoint {
  readonly month: string;
  readonly index: Decimal;
}

export interface RealReturnInput {
  /** Rentabilidad nominal acumulada del periodo (0,1 = 10 %), de `twr` o `xirr`. */
  readonly nominalCumulative: Decimal;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
  readonly cpi: readonly CpiPoint[];
}

export interface RateTriple {
  readonly nominal: Decimal;
  readonly inflation: Decimal;
  readonly real: Decimal;
}

export interface RealReturn {
  readonly cumulative: RateTriple;
  /** `null` si el periodo no dura ni un día. */
  readonly annualized: RateTriple | null;
  readonly annualizedReliable: boolean;
  readonly days: number;
}

export interface RealReturnExplanation {
  readonly method: "returns.real";
  readonly from: CalendarDate;
  readonly to: CalendarDate;
  readonly days: number;
  readonly assumptions: readonly string[];
  /** Índice de IPC aplicado al inicio y al final (ya interpolado). */
  readonly cpiIndexFrom: Decimal;
  readonly cpiIndexTo: Decimal;
  readonly quality: ReturnQuality;
}

export interface RealReturnResult {
  readonly value: RealReturn;
  readonly explanation: RealReturnExplanation;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function nextMonth(month: string): string {
  return addDays(`${month}-28` as CalendarDate, 4).slice(0, 7);
}

/**
 * Rentabilidad real: r_real = (1 + r_nominal) / (1 + π) − 1, con π = IPC(fin) / IPC(inicio) − 1.
 * No se resta `r − π` salvo para explicarlo: la resta es una aproximación que falla con tasas altas.
 *
 * El IPC es mensual. Para una fecha dentro de un mes se interpola linealmente entre el índice
 * de ese mes y el del siguiente (suponiendo que cada índice vale para el día 1). Si la fecha cae
 * en el último mes publicado o después, se usa ese último índice y se avisa de hasta qué mes llega.
 */
export function realReturn(input: RealReturnInput): Result<RealReturnResult, DomainError> {
  const { from, to, nominalCumulative } = input;
  if (compareDates(to, from) < 0) return err({ code: "returns.invalid_period" });

  const byMonth = new Map<string, Decimal>();
  for (const point of input.cpi) {
    if (!MONTH.test(point.month) || !point.index.gt(0)) {
      return err({ code: "returns.cpi_invalid", params: { month: point.month } });
    }
    byMonth.set(point.month, point.index);
  }
  const months = [...byMonth.keys()].sort();
  const latestMonth = months[months.length - 1];
  if (latestMonth === undefined) return err({ code: "returns.cpi_not_available" });
  const latestIndex = byMonth.get(latestMonth) as Decimal;

  const latest = { used: false };
  const indexAt = (date: CalendarDate): Decimal | null => {
    const month = date.slice(0, 7);
    if (month >= latestMonth) {
      latest.used = true;
      return latestIndex;
    }
    const here = byMonth.get(month);
    const next = byMonth.get(nextMonth(month));
    if (!here || !next) return null;
    const monthLength = daysBetween(
      `${month}-01` as CalendarDate,
      `${nextMonth(month)}-01` as CalendarDate,
    );
    const elapsed = Number(date.slice(8, 10)) - 1;
    return here.plus(next.minus(here).mul(elapsed).div(monthLength));
  };

  const indexFrom = indexAt(from);
  if (!indexFrom) return err({ code: "returns.cpi_not_available", params: { date: from } });
  const indexTo = indexAt(to);
  if (!indexTo) return err({ code: "returns.cpi_not_available", params: { date: to } });

  const days = daysBetween(from, to);
  const triple = (nominal: Decimal, inflation: Decimal): RateTriple => ({
    nominal,
    inflation,
    real: nominal.plus(1).div(inflation.plus(1)).minus(1),
  });
  const inflation = indexTo.div(indexFrom).minus(1);
  const notes: DomainError[] = latest.used
    ? [{ code: "returns.cpi_latest_published", params: { until: latestMonth } }]
    : [];

  return ok({
    value: {
      cumulative: triple(nominalCumulative, inflation),
      annualized:
        days === 0 ? null : triple(annualize(nominalCumulative, days), annualize(inflation, days)),
      annualizedReliable: isAnnualizedReliable(days),
      days,
    },
    explanation: {
      method: "returns.real",
      from,
      to,
      days,
      assumptions: [
        "returns.real_ratio_not_difference",
        "returns.cpi_monthly_linear_interpolation",
        "returns.cpi_index_applies_to_first_day",
      ],
      cpiIndexFrom: indexFrom,
      cpiIndexTo: indexTo,
      quality: { level: notes.length === 0 ? "complete" : "approximate", notes },
    },
  });
}

/** Atajo para pruebas y la web: IPC como texto → `CpiPoint`. */
export const cpiPoint = (month: string, index: string): CpiPoint => ({ month, index: dec(index) });

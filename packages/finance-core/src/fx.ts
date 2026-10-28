import { compareDates, daysBetween, type CalendarDate } from "./calendar-date";
import { Decimal, type RoundingMode } from "./decimal";
import { fromDecimal, money, toDecimal, type CurrencyCode, type Money } from "./money";
import { err, ok, type DomainError, type Result } from "./result";

/** 1 unidad de `base` = `rate` unidades de `quote`, publicado en `asOf`. */
export interface FxRate {
  readonly base: CurrencyCode;
  readonly quote: CurrencyCode;
  readonly asOf: CalendarDate;
  readonly rate: Decimal;
  readonly source: string;
}

/** Cómo se obtuvo el tipo aplicado: se muestra al usuario en "¿de dónde sale?". */
export interface FxExplanation {
  readonly method: "identity" | "direct" | "inverse" | "cross";
  /** Tipo efectivo from→to con todos sus dígitos. */
  readonly effectiveRate: string;
  readonly rates: readonly {
    base: CurrencyCode;
    quote: CurrencyCode;
    asOf: CalendarDate;
    source: string;
  }[];
  /** Días entre el tipo más antiguo usado y la fecha pedida (0 = del mismo día). */
  readonly staleDays: number;
}

export interface Converted {
  readonly value: Money;
  readonly explanation: FxExplanation;
}

/** Último tipo publicado en o antes de `onDate` para el par exacto. */
function latestRate(
  rates: readonly FxRate[],
  base: CurrencyCode,
  quote: CurrencyCode,
  onDate: CalendarDate,
): FxRate | undefined {
  let best: FxRate | undefined;
  for (const r of rates) {
    if (r.base !== base || r.quote !== quote || compareDates(r.asOf, onDate) > 0) continue;
    if (!best || compareDates(r.asOf, best.asOf) > 0) best = r;
  }
  return best;
}

interface Leg {
  readonly rate: Decimal;
  readonly used: FxRate;
}

function findLeg(
  rates: readonly FxRate[],
  from: CurrencyCode,
  to: CurrencyCode,
  onDate: CalendarDate,
): (Leg & { inverse: boolean }) | undefined {
  const direct = latestRate(rates, from, to, onDate);
  const inverse = latestRate(rates, to, from, onDate);
  // Si existen los dos sentidos, se usa el más reciente; a igualdad, el directo.
  if (direct && (!inverse || compareDates(direct.asOf, inverse.asOf) >= 0)) {
    return { rate: direct.rate, used: direct, inverse: false };
  }
  if (inverse) return { rate: new Decimal(1).div(inverse.rate), used: inverse, inverse: true };
  return undefined;
}

/**
 * Convierte un importe con el tipo vigente en `onDate` (último publicado en o antes de esa
 * fecha). Prueba el par directo, el inverso y, por último, el cruce a través de `pivot`
 * (EUR por defecto, porque los tipos de referencia del BCE están en EUR).
 */
export function convert(
  amount: Money,
  to: CurrencyCode,
  rates: readonly FxRate[],
  onDate: CalendarDate,
  options: { pivot?: CurrencyCode; rounding?: RoundingMode } = {},
): Result<Converted, DomainError> {
  const { pivot = "EUR", rounding = "HALF_EVEN" } = options;
  if (amount.currency === to) {
    return ok({
      value: money(amount.minor, to),
      explanation: { method: "identity", effectiveRate: "1", rates: [], staleDays: 0 },
    });
  }

  const describe = (legs: readonly Leg[]) =>
    legs.map(({ used }) => ({
      base: used.base,
      quote: used.quote,
      asOf: used.asOf,
      source: used.source,
    }));
  const staleDays = (legs: readonly Leg[]) =>
    Math.max(...legs.map(({ used }) => daysBetween(used.asOf, onDate)));

  const single = findLeg(rates, amount.currency, to, onDate);
  if (single) {
    return ok({
      value: fromDecimal(toDecimal(amount).mul(single.rate), to, rounding),
      explanation: {
        method: single.inverse ? "inverse" : "direct",
        effectiveRate: single.rate.toString(),
        rates: describe([single]),
        staleDays: staleDays([single]),
      },
    });
  }

  if (amount.currency !== pivot && to !== pivot) {
    const first = findLeg(rates, amount.currency, pivot, onDate);
    const second = findLeg(rates, pivot, to, onDate);
    if (first && second) {
      const rate = first.rate.mul(second.rate);
      return ok({
        value: fromDecimal(toDecimal(amount).mul(rate), to, rounding),
        explanation: {
          method: "cross",
          effectiveRate: rate.toString(),
          rates: describe([first, second]),
          staleDays: staleDays([first, second]),
        },
      });
    }
  }

  return err({
    code: "fx.rate_not_found",
    params: { from: amount.currency, to, onDate },
  });
}

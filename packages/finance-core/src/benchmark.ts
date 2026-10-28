import { compareDates, daysBetween, type CalendarDate } from "./calendar-date";
import { dec, type Decimal } from "./decimal";
import { add, fromDecimal, sub, toDecimal, zero, type CurrencyCode, type Money } from "./money";
import { err, ok, type DomainError, type Result } from "./result";
import type { ExternalFlow } from "./returns";

/** Precio de la referencia en una fecha, en la moneda del cálculo. */
export interface PricePoint {
  readonly date: CalendarDate;
  readonly price: Decimal;
}

export interface BenchmarkInput {
  readonly currency: CurrencyCode;
  /** Aportaciones (+) y retiradas (−) reales de la cartera. */
  readonly flows: readonly ExternalFlow[];
  readonly portfolioValue: Money;
  /** Serie de precios de la referencia (un índice, un fondo, lo que la persona elija), en cualquier orden. */
  readonly prices: readonly PricePoint[];
  /** "Hoy" en la zona del espacio: la librería no lee el reloj. */
  readonly onDate: CalendarDate;
}

export interface Benchmark {
  /** Aportaciones menos retiradas hasta la fecha. */
  readonly contributed: Money;
  /** Lo que valdría hoy la referencia si se hubieran hecho las mismas aportaciones y retiradas. */
  readonly benchmarkValue: Money;
  readonly portfolioGain: Money;
  readonly benchmarkGain: Money;
  /** Cartera − referencia: positivo si la cartera ha ido mejor. */
  readonly difference: Money;
  /** Ganancia / aportado de cada una; `null` si lo aportado no es positivo. */
  readonly portfolioReturn: Decimal | null;
  readonly benchmarkReturn: Decimal | null;
}

export interface BenchmarkExplanation {
  readonly method: "benchmark.same_flows";
  readonly flowCount: number;
  readonly firstFlowDate: CalendarDate;
  /** Fecha del último precio usado para valorar la referencia hoy. */
  readonly lastPriceDate: CalendarDate;
  readonly caveats: readonly string[];
}

export interface BenchmarkResult {
  readonly value: Benchmark;
  readonly explanation: BenchmarkExplanation;
}

/** Un precio más viejo que esto frente a «hoy» se señala: la referencia estaría desfasada. */
const STALE_PRICE_DAYS = 7;

/**
 * Compara la cartera con una referencia elegida por la persona aplicando a la referencia **las
 * mismas aportaciones y retiradas en las mismas fechas**: cada flujo compra o vende participaciones
 * al último precio conocido de ese día o anterior, y el total se valora al último precio. Es la
 * comparación honesta; comparar porcentajes sueltos no lo es. Es información histórica, no una
 * recomendación. Aritmética exacta (Decimal) con un único redondeo al céntimo al final.
 */
export function compareWithBenchmark(input: BenchmarkInput): Result<BenchmarkResult, DomainError> {
  const { currency, onDate } = input;
  if (
    input.portfolioValue.currency !== currency ||
    input.flows.some((f) => f.amount.currency !== currency)
  ) {
    return err({ code: "benchmark.currency_mismatch" });
  }
  const flows = input.flows
    .filter((f) => f.date <= onDate)
    .sort((a, b) => compareDates(a.date, b.date));
  const first = flows[0];
  if (!first) return err({ code: "benchmark.no_flows" });

  const prices = input.prices
    .filter((p) => p.date <= onDate)
    .sort((a, b) => compareDates(a.date, b.date));
  if (prices.some((p) => !p.price.isFinite() || !p.price.gt(0))) {
    return err({ code: "benchmark.invalid_price" });
  }
  // Último precio conocido en esa fecha o antes (las series quedan ordenadas por fecha).
  const priceOn = (date: CalendarDate): PricePoint | undefined =>
    prices.filter((p) => p.date <= date).at(-1);

  let units = dec("0");
  let contributed = zero(currency);
  for (const flow of flows) {
    const at = priceOn(flow.date);
    if (!at) return err({ code: "benchmark.no_price", params: { date: flow.date } });
    units = units.plus(toDecimal(flow.amount).div(at.price));
    contributed = add(contributed, flow.amount);
    if (units.isNegative()) return err({ code: "benchmark.oversold", params: { date: flow.date } });
  }

  const last = priceOn(onDate) as PricePoint; // existe: ya hubo precio para el primer flujo, que es anterior
  const benchmarkValue = fromDecimal(units.mul(last.price), currency);
  const portfolioGain = sub(input.portfolioValue, contributed);
  const benchmarkGain = sub(benchmarkValue, contributed);
  const ratio = (gain: Money) =>
    contributed.minor > 0n ? toDecimal(gain).div(toDecimal(contributed)) : null;

  const caveats: string[] = [];
  if (daysBetween(last.date, onDate) > STALE_PRICE_DAYS)
    caveats.push("benchmark.caveat.stale_price");
  if (contributed.minor <= 0n) caveats.push("benchmark.caveat.no_positive_contribution");

  return ok({
    value: {
      contributed,
      benchmarkValue,
      portfolioGain,
      benchmarkGain,
      difference: sub(input.portfolioValue, benchmarkValue),
      portfolioReturn: ratio(portfolioGain),
      benchmarkReturn: ratio(benchmarkGain),
    },
    explanation: {
      method: "benchmark.same_flows",
      flowCount: flows.length,
      firstFlowDate: first.date,
      lastPriceDate: last.date,
      caveats,
    },
  });
}

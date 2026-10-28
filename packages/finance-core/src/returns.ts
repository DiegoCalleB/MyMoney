import { compareDates, daysBetween, type CalendarDate } from "./calendar-date";
import { Decimal, dec } from "./decimal";
import { CurrencyMismatchError, money, type CurrencyCode, type Money } from "./money";
import { err, ok, type DomainError, type Result } from "./result";

/** Valor de una cuenta (o cartera) al cierre de una fecha, incluidos los flujos de ese día. */
export interface ValuePoint {
  readonly date: CalendarDate;
  readonly value: Money;
}

/**
 * Flujo externo visto desde la cuenta: aportación (> 0, entra dinero de fuera) o retirada
 * (< 0, sale). Un traspaso interno **no** es un flujo externo (ADR-0006).
 */
export interface ExternalFlow {
  readonly date: CalendarDate;
  readonly amount: Money;
}

export interface ReturnQuality {
  /** `approximate`: hay aproximaciones (Dietz, IPC provisional). `partial`: faltan tramos. */
  readonly level: "complete" | "approximate" | "partial";
  readonly notes: readonly DomainError[];
}

export interface ReturnExplanation<M extends string> {
  readonly method: M;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
  readonly days: number;
  readonly currency: CurrencyCode;
  /** Códigos estables (i18n) de los supuestos aplicados. */
  readonly assumptions: readonly string[];
  readonly quality: ReturnQuality;
}

export const DAYS_PER_YEAR = 365;

/** Rentabilidad anualizada de una rentabilidad acumulada `r` en `days` días: (1+r)^(365/days) − 1. */
export function annualize(cumulative: Decimal, days: number): Decimal {
  return cumulative
    .plus(1)
    .pow(dec(String(DAYS_PER_YEAR)).div(days))
    .minus(1);
}

/** Una anualización sobre menos de un año extrapola demasiado: la interfaz no debe mostrarla. */
export const isAnnualizedReliable = (days: number): boolean => days >= DAYS_PER_YEAR;

function minorIn(currency: CurrencyCode, m: Money): bigint {
  if (m.currency !== currency) throw new CurrencyMismatchError(currency, m.currency);
  return m.minor;
}

// ---------------------------------------------------------------------------------------------
// Periodo: valor inicial opcional + flujos externos + valor final
// ---------------------------------------------------------------------------------------------

export interface PeriodInput {
  /**
   * Valor al inicio. Si no se indica, el periodo empieza en el primer flujo (la cuenta se abre
   * con una aportación).
   */
  readonly startValue?: ValuePoint;
  /** Flujos externos con fecha posterior a `startValue` y no posterior a `endValue`. */
  readonly flows: readonly ExternalFlow[];
  readonly endValue: ValuePoint;
}

interface Period {
  readonly currency: CurrencyCode;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
  readonly days: number;
  readonly startMinor: bigint;
  readonly endMinor: bigint;
  readonly flows: readonly { readonly date: CalendarDate; readonly minor: bigint }[];
}

function normalizePeriod(input: PeriodInput): Result<Period, DomainError> {
  const { startValue, endValue } = input;
  const currency = endValue.value.currency;
  const startMinor = startValue ? minorIn(currency, startValue.value) : 0n;
  const flows = input.flows.map((f) => ({ date: f.date, minor: minorIn(currency, f.amount) }));
  const to = endValue.date;

  if (startValue && compareDates(to, startValue.date) < 0) {
    return err({ code: "returns.invalid_period" });
  }
  for (const f of flows) {
    const afterEnd = compareDates(f.date, to) > 0;
    const beforeStart = startValue !== undefined && compareDates(f.date, startValue.date) <= 0;
    if (afterEnd || beforeStart) {
      return err({ code: "returns.flow_outside_period", params: { date: f.date } });
    }
  }
  const from = startValue
    ? startValue.date
    : flows.reduce((min, f) => (compareDates(f.date, min) < 0 ? f.date : min), to);
  return ok({
    currency,
    from,
    to,
    days: daysBetween(from, to),
    startMinor,
    endMinor: endValue.value.minor,
    flows,
  });
}

// ---------------------------------------------------------------------------------------------
// Aportado frente a ganado
// ---------------------------------------------------------------------------------------------

export interface ContributedVsGained {
  /** Valor con el que empieza el periodo (cero si empieza con la primera aportación). */
  readonly opening: Money;
  /** Suma de las aportaciones externas del periodo. */
  readonly contributed: Money;
  /** Suma de las retiradas externas del periodo (positivo). */
  readonly withdrawn: Money;
  /** Dinero puesto de fuera y no retirado: apertura + aportado − retirado. */
  readonly netInvested: Money;
  readonly endValue: Money;
  /** Valor final − dinero neto puesto. Ya descuenta comisiones e impuestos. */
  readonly gain: Money;
}

export interface ContributedVsGainedResult {
  readonly value: ContributedVsGained;
  readonly explanation: ReturnExplanation<"returns.contributed_vs_gained">;
}

function breakdown(p: Period): ContributedVsGained {
  const contributed = p.flows.reduce((acc, f) => (f.minor > 0n ? acc + f.minor : acc), 0n);
  const withdrawn = p.flows.reduce((acc, f) => (f.minor < 0n ? acc - f.minor : acc), 0n);
  const netInvested = p.startMinor + contributed - withdrawn;
  const m = (minor: bigint): Money => money(minor, p.currency);
  return {
    opening: m(p.startMinor),
    contributed: m(contributed),
    withdrawn: m(withdrawn),
    netInvested: m(netInvested),
    endValue: m(p.endMinor),
    gain: m(p.endMinor - netInvested),
  };
}

/**
 * Separa lo que has puesto de lo que has ganado. Un saldo que sube puede ser solo aportaciones:
 * ganancia = valor actual − Σ aportaciones + Σ retiradas (− valor inicial si lo hay).
 */
export function contributedVsGained(
  input: PeriodInput,
): Result<ContributedVsGainedResult, DomainError> {
  const period = normalizePeriod(input);
  if (!period.ok) return period;
  const p = period.value;
  return ok({
    value: breakdown(p),
    explanation: {
      method: "returns.contributed_vs_gained",
      from: p.from,
      to: p.to,
      days: p.days,
      currency: p.currency,
      assumptions: ["returns.fees_and_taxes_inside_value"],
      quality: { level: "complete", notes: [] },
    },
  });
}

// ---------------------------------------------------------------------------------------------
// XIRR: rentabilidad ponderada por dinero
// ---------------------------------------------------------------------------------------------

export interface XirrOptions {
  /** Estimación inicial de Newton (anual, 0,1 = 10 %). Por defecto, la rentabilidad simple anualizada. */
  readonly initialGuess?: Decimal;
}

export interface Xirr {
  /** Rentabilidad anual equivalente (0,1 = 10 %). */
  readonly annualized: Decimal;
  /** `false` si el periodo es menor de un año: muestra la acumulada, no la anualizada. */
  readonly annualizedReliable: boolean;
  /** Ganancia / (valor inicial + aportaciones). No pondera por tiempo. */
  readonly cumulative: Decimal;
  readonly days: number;
}

export interface XirrExplanation extends ReturnExplanation<"returns.xirr"> {
  readonly solver: "newton" | "bisection" | "total_loss";
  readonly iterations: number;
}

export interface XirrResult {
  readonly value: Xirr;
  readonly explanation: XirrExplanation;
}

const NPV_RELATIVE_TOLERANCE = dec("1e-10");
const BISECTION_WIDTH = dec("1e-14");
const NEWTON_MAX_ITERATIONS = 100;
const RATE_FLOOR = dec("-0.9999");
const RATE_CEILING_START = dec("10");
const RATE_CEILING_MAX = dec("1e12");

interface Cashflow {
  readonly date: CalendarDate;
  /** Positivo si entra dinero al inversor (retirada, valor final); negativo si lo pone. */
  readonly amount: Decimal;
  readonly years: Decimal;
}

function cashflows(p: Period): Cashflow[] {
  const byDate = new Map<CalendarDate, bigint>();
  const put = (date: CalendarDate, minor: bigint): void => {
    byDate.set(date, (byDate.get(date) ?? 0n) + minor);
  };
  put(p.from, -p.startMinor);
  for (const f of p.flows) put(f.date, -f.minor);
  put(p.to, p.endMinor);
  const sorted = [...byDate]
    .filter(([, minor]) => minor !== 0n)
    .sort(([a], [b]) => compareDates(a, b));
  const first = sorted[0]?.[0];
  return sorted.map(([date, minor]) => ({
    date,
    amount: dec(minor),
    // `first` existe porque `sorted` no está vacío al llegar aquí.
    years: dec(String(daysBetween(first as CalendarDate, date))).div(DAYS_PER_YEAR),
  }));
}

function npvAt(flows: readonly Cashflow[], rate: Decimal): Decimal {
  const base = rate.plus(1);
  return flows.reduce((acc, f) => acc.plus(f.amount.mul(base.pow(f.years.neg()))), new Decimal(0));
}

function npvSlope(flows: readonly Cashflow[], rate: Decimal): Decimal {
  const base = rate.plus(1);
  return flows.reduce(
    (acc, f) => acc.plus(f.amount.mul(f.years.neg()).mul(base.pow(f.years.neg().minus(1)))),
    new Decimal(0),
  );
}

function newton(
  flows: readonly Cashflow[],
  guess: Decimal,
  tolerance: Decimal,
): { rate: Decimal; iterations: number } | null {
  let rate = guess;
  for (let i = 1; i <= NEWTON_MAX_ITERATIONS; i++) {
    const value = npvAt(flows, rate);
    if (value.abs().lte(tolerance)) return { rate, iterations: i };
    const next = rate.minus(value.div(npvSlope(flows, rate)));
    if (!next.isFinite() || next.lte(-1)) break;
    rate = next;
  }
  return null;
}

function bisection(flows: readonly Cashflow[]): { rate: Decimal; iterations: number } | null {
  let lo = RATE_FLOOR;
  let hi = RATE_CEILING_START;
  const atLo = npvAt(flows, lo);
  // El valor final domina cuando la tasa es enorme: ampliamos el techo hasta ver un cambio de signo.
  while (atLo.mul(npvAt(flows, hi)).gt(0) && hi.lt(RATE_CEILING_MAX)) hi = hi.mul(10);
  if (atLo.mul(npvAt(flows, hi)).gt(0)) return null;

  const loPositive = atLo.isPositive();
  let iterations = 0;
  while (hi.minus(lo).gt(BISECTION_WIDTH)) {
    iterations++;
    const mid = lo.plus(hi).div(2);
    if (npvAt(flows, mid).isPositive() === loPositive) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { rate: lo.plus(hi).div(2), iterations };
}

/**
 * XIRR: la tasa anual `r` que anula Σ CFᵢ / (1+r)^(díasᵢ/365). Responde "¿cuánto ha rendido mi
 * dinero, teniendo en cuenta cuándo lo puse?". Depende de tus aportaciones; para comparar con
 * un fondo o un índice usa la ponderada por tiempo (`twr`).
 *
 * Newton con respaldo en bisección (ADR-0007). Los flujos del mismo día se agregan. Si hay
 * varios cambios de signo puede haber más de una raíz: se avisa en `quality.notes`.
 */
export function xirr(
  input: PeriodInput,
  options: XirrOptions = {},
): Result<XirrResult, DomainError> {
  const period = normalizePeriod(input);
  if (!period.ok) return period;
  const p = period.value;
  const flows = cashflows(p);

  const negatives = flows.filter((f) => f.amount.isNegative());
  const positives = flows.filter((f) => f.amount.isPositive());
  if (flows.length === 0) return err({ code: "returns.no_flows" });
  if (negatives.length === 0) return err({ code: "returns.same_sign" });

  // Hay al menos un flujo negativo, es decir, valor inicial o aportaciones: la base nunca es cero.
  const { opening, contributed, gain } = breakdown(p);
  const cumulative = dec(gain.minor).div(dec(opening.minor + contributed.minor));

  const explain = (
    solver: XirrExplanation["solver"],
    iterations: number,
    notes: DomainError[],
  ): XirrExplanation => ({
    method: "returns.xirr",
    from: p.from,
    to: p.to,
    days: p.days,
    currency: p.currency,
    assumptions: ["returns.xirr_365_day_year", "returns.xirr_same_day_flows_netted"],
    quality: { level: notes.length === 0 ? "complete" : "approximate", notes },
    solver,
    iterations,
  });
  const value = (annualized: Decimal): Xirr => ({
    annualized,
    annualizedReliable: isAnnualizedReliable(p.days),
    cumulative,
    days: p.days,
  });

  if (positives.length === 0) {
    // Todo lo puesto se perdió: −100 % sin necesidad de resolver nada.
    return ok({ value: value(new Decimal(-1)), explanation: explain("total_loss", 0, []) });
  }

  const totalOut = negatives.reduce((acc, f) => acc.plus(f.amount.abs()), new Decimal(0));
  const totalIn = positives.reduce((acc, f) => acc.plus(f.amount), new Decimal(0));
  const span = (flows[flows.length - 1] as Cashflow).years;
  const simple = totalIn.div(totalOut).pow(dec("1").div(span)).minus(1);
  const guess =
    options.initialGuess ?? Decimal.max(RATE_FLOOR, Decimal.min(simple, RATE_CEILING_START));

  const tolerance = NPV_RELATIVE_TOLERANCE.mul(
    flows.reduce((acc, f) => acc.plus(f.amount.abs()), new Decimal(0)),
  );
  const viaNewton = newton(flows, guess, tolerance);
  const solved = viaNewton ?? bisection(flows);
  if (!solved) return err({ code: "returns.no_convergence" });

  const signChanges = flows.filter(
    (f, i) => i > 0 && f.amount.isNegative() !== (flows[i - 1] as Cashflow).amount.isNegative(),
  ).length;
  const notes: DomainError[] = signChanges > 1 ? [{ code: "returns.xirr_multiple_roots" }] : [];
  return ok({
    value: value(solved.rate),
    explanation: explain(viaNewton ? "newton" : "bisection", solved.iterations, notes),
  });
}

// ---------------------------------------------------------------------------------------------
// TWR: rentabilidad ponderada por tiempo
// ---------------------------------------------------------------------------------------------

export interface TwrInput {
  /** Valores al cierre de cada fecha (incluyen los flujos de ese día). Se necesitan al menos dos. */
  readonly valuations: readonly ValuePoint[];
  readonly flows: readonly ExternalFlow[];
}

export interface TwrSegment {
  readonly from: CalendarDate;
  readonly to: CalendarDate;
  readonly startValue: Money;
  readonly endValue: Money;
  /** Suma de flujos externos del tramo (aportaciones − retiradas). */
  readonly netFlow: Money;
  readonly rate: Decimal;
  /** `false` si el tramo tiene flujos entre dos valoraciones y se usó Dietz modificado. */
  readonly exact: boolean;
}

export interface Twr {
  /** Producto de (1 + rᵢ) − 1 de los tramos calculables. */
  readonly cumulative: Decimal;
  readonly annualized: Decimal;
  readonly annualizedReliable: boolean;
  readonly days: number;
  readonly segments: readonly TwrSegment[];
}

export interface TwrResult {
  readonly value: Twr;
  readonly explanation: ReturnExplanation<"returns.twr">;
}

/**
 * TWR: encadena la rentabilidad de cada tramo entre valoraciones para quitar el efecto de cuándo
 * y cuánto aportaste. Es la que sirve para comparar con un fondo o un índice.
 *
 * Con un flujo en mitad de un tramo no se conoce el valor justo antes de él: se usa Dietz
 * modificado, R = (V₁ − V₀ − F) / (V₀ + Σ wᵢ·Fᵢ), y el resultado se marca como aproximado.
 * Un tramo sin base de cálculo (V₀ + ΣwF ≤ 0) no se encadena: queda como `partial` y se avisa.
 */
export function twr(input: TwrInput): Result<TwrResult, DomainError> {
  const valuations = [...input.valuations].sort((a, b) => compareDates(a.date, b.date));
  if (valuations.length < 2) return err({ code: "returns.insufficient_valuations" });
  const first = valuations[0] as ValuePoint;
  const last = valuations[valuations.length - 1] as ValuePoint;
  const currency = first.value.currency;

  for (let i = 1; i < valuations.length; i++) {
    if ((valuations[i] as ValuePoint).date === (valuations[i - 1] as ValuePoint).date) {
      return err({
        code: "returns.duplicate_valuation_date",
        params: { date: (valuations[i] as ValuePoint).date },
      });
    }
  }
  const flows = input.flows.map((f) => ({ date: f.date, minor: minorIn(currency, f.amount) }));
  for (const f of flows) {
    if (compareDates(f.date, first.date) < 0 || compareDates(f.date, last.date) > 0) {
      return err({ code: "returns.flow_outside_period", params: { date: f.date } });
    }
  }

  const segments: TwrSegment[] = [];
  const notes: DomainError[] = [];
  let approximate = false;
  for (let i = 1; i < valuations.length; i++) {
    const v0 = valuations[i - 1] as ValuePoint;
    const v1 = valuations[i] as ValuePoint;
    const length = daysBetween(v0.date, v1.date);
    const inSegment = flows.filter(
      (f) => compareDates(f.date, v0.date) > 0 && compareDates(f.date, v1.date) <= 0,
    );
    const netFlow = inSegment.reduce((acc, f) => acc + f.minor, 0n);
    const weighted = inSegment.reduce(
      (acc, f) =>
        acc.plus(
          dec(f.minor)
            .mul(length - daysBetween(v0.date, f.date))
            .div(length),
        ),
      new Decimal(0),
    );
    const start = dec(minorIn(currency, v0.value));
    const denominator = start.plus(weighted);
    const numerator = dec(minorIn(currency, v1.value)).minus(start).minus(dec(netFlow));
    const span = { from: v0.date, to: v1.date };

    let rate: Decimal;
    if (denominator.lte(0)) {
      if (!numerator.isZero()) {
        notes.push({ code: "returns.twr_segment_skipped", params: span });
        continue;
      }
      rate = new Decimal(0);
    } else {
      rate = numerator.div(denominator);
    }
    const exact = inSegment.every((f) => f.date === v1.date);
    if (!exact) {
      approximate = true;
      notes.push({ code: "returns.twr_dietz_approximation", params: span });
    }
    segments.push({
      ...span,
      startValue: v0.value,
      endValue: v1.value,
      netFlow: money(netFlow, currency),
      rate,
      exact,
    });
  }

  if (segments.length === 0) return err({ code: "returns.twr_no_computable_segments" });
  const cumulative = segments.reduce((acc, s) => acc.mul(s.rate.plus(1)), new Decimal(1)).minus(1);
  const days = daysBetween(first.date, last.date);
  const skipped = segments.length < valuations.length - 1;
  return ok({
    value: {
      cumulative,
      annualized: annualize(cumulative, days),
      annualizedReliable: isAnnualizedReliable(days),
      days,
      segments,
    },
    explanation: {
      method: "returns.twr",
      from: first.date,
      to: last.date,
      days,
      currency,
      assumptions: [
        "returns.twr_valuation_includes_same_day_flows",
        "returns.twr_chained_segments",
        "returns.twr_dietz_when_flow_inside_segment",
      ],
      quality: { level: skipped ? "partial" : approximate ? "approximate" : "complete", notes },
    },
  });
}

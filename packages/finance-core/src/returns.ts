import { compareDates, daysBetween, type CalendarDate } from "./calendar-date";
import { Decimal, dec, type Decimal as DecimalType } from "./decimal";
import { add, negate, sub, toDecimal, zero, type Money } from "./money";
import { err, ok, type DomainError, type Result } from "./result";

/** Aportación (positiva) o retirada (negativa) externa a una cuenta, en la moneda de la cuenta. */
export interface ExternalFlow {
  readonly date: CalendarDate;
  readonly amount: Money;
}

export interface ReturnsInput {
  readonly flows: readonly ExternalFlow[];
  readonly currentValue: Money;
  /** "Hoy" en la zona del espacio: la librería no lee el reloj. */
  readonly onDate: CalendarDate;
}

export interface Returns {
  /** Aportaciones menos retiradas hasta la fecha. */
  readonly contributed: Money;
  readonly currentValue: Money;
  /** Valor actual − aportado neto. Las comisiones e impuestos ya están dentro del valor. */
  readonly gain: Money;
  /** Ganancia / aportado, como decimal (0,25 = 25 %). `null` si lo aportado no es positivo. */
  readonly simple: DecimalType | null;
  /** Rentabilidad anualizada ponderada por dinero (XIRR); `null` si no es fiable. */
  readonly annualized: DecimalType | null;
}

export interface ReturnsExplanation {
  readonly method: "returns.money_weighted";
  readonly firstFlowDate: CalendarDate;
  readonly periodDays: number;
  readonly flowCount: number;
  /** Códigos estables (i18n) de lo que limita la fiabilidad del resultado. */
  readonly caveats: readonly string[];
}

export interface ReturnsResult {
  readonly value: Returns;
  readonly explanation: ReturnsExplanation;
}

/** Un año de datos como mínimo: antes, anualizar exagera lo que se ve. */
const MIN_ANNUALIZED_DAYS = 365;
const LOW = dec("-0.9999");
const HIGH = dec("10");
const TOLERANCE = dec("1e-12");
const MAX_ITERATIONS = 200;

/** Valor presente neto de los flujos (aportación = −, retirada y valor final = +) con tasa `r`. */
function npv(
  flows: readonly { readonly days: number; readonly cf: DecimalType }[],
  r: DecimalType,
) {
  const base = new Decimal(1).plus(r);
  return flows.reduce(
    (sum, f) => sum.plus(f.cf.div(base.pow(dec(String(f.days)).div(365)))),
    new Decimal(0),
  );
}

/** Cambios de signo en la secuencia de flujos: más de uno puede dar varias raíces. */
function signChanges(values: readonly DecimalType[]): number {
  let changes = 0;
  let previous = 0;
  for (const v of values) {
    const sign = v.isZero() ? 0 : v.isPositive() ? 1 : -1;
    if (sign !== 0 && previous !== 0 && sign !== previous) changes += 1;
    if (sign !== 0) previous = sign;
  }
  return changes;
}

/** Bisección en [−99,99 %; 1000 %]: el VAN decrece con la tasa cuando el signo cambia una vez. */
function solve(flows: readonly { readonly days: number; readonly cf: DecimalType }[]) {
  let low = LOW;
  let high = HIGH;
  if (npv(flows, low).isNegative() || npv(flows, high).isPositive()) return null;
  let mid = low.plus(high).div(2);
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    mid = low.plus(high).div(2);
    const value = npv(flows, mid);
    if (value.abs().lt(TOLERANCE) || high.minus(low).lt(TOLERANCE)) break;
    if (value.isPositive()) low = mid;
    else high = mid;
  }
  return mid;
}

/**
 * Aportado frente a ganado, con rentabilidad simple y anualizada (XIRR). Los flujos del mismo
 * día se agregan. La anualizada solo se da con al menos un año de historia y una única
 * solución clara; en otro caso se omite y se explica por qué en `caveats`.
 */
export function returns(input: ReturnsInput): Result<ReturnsResult, DomainError> {
  const { currentValue, onDate } = input;
  const currency = currentValue.currency;
  const flows = input.flows.filter((f) => f.date <= onDate);
  const first = flows.reduce<CalendarDate | null>(
    (min, f) => (min === null || f.date < min ? f.date : min),
    null,
  );
  if (first === null) return err({ code: "returns.no_flows" });

  const byDate = new Map<CalendarDate, Money>();
  for (const f of flows) byDate.set(f.date, add(byDate.get(f.date) ?? zero(currency), f.amount));
  const ordered = [...byDate.entries()].sort(([a], [b]) => compareDates(a, b));

  let contributed = zero(currency);
  for (const [, amount] of ordered) contributed = add(contributed, amount);
  const gain = sub(currentValue, contributed);
  const periodDays = daysBetween(first, onDate);
  const caveats: string[] = [];

  const simple = contributed.minor > 0n ? toDecimal(gain).div(toDecimal(contributed)) : null;
  if (simple === null) caveats.push("returns.caveat.no_positive_contribution");

  let annualized: DecimalType | null = null;
  if (periodDays < MIN_ANNUALIZED_DAYS) {
    caveats.push("returns.caveat.short_period");
  } else if (simple !== null) {
    const cashflows = [
      ...ordered.map(([date, amount]) => ({
        days: daysBetween(first, date),
        cf: toDecimal(negate(amount)),
      })),
      { days: periodDays, cf: toDecimal(currentValue) },
    ];
    if (signChanges(cashflows.map((c) => c.cf)) > 1) caveats.push("returns.caveat.multiple_roots");
    else annualized = solve(cashflows);
    if (annualized === null && !caveats.includes("returns.caveat.multiple_roots"))
      caveats.push("returns.caveat.no_solution");
  }
  // Fecha única y simplificada: si todo se aportó en un día, la fecha real de cada entrega no se conoce.
  if (ordered.length === 1) caveats.push("returns.caveat.single_flow_date");

  return ok({
    value: { contributed, currentValue, gain, simple, annualized },
    explanation: {
      method: "returns.money_weighted",
      firstFlowDate: first,
      periodDays,
      flowCount: flows.length,
      caveats,
    },
  });
}

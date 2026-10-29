import { addDays, type CalendarDate } from "./calendar-date";
import type { Decimal } from "./decimal";
import { add, toDecimal, zero, type CurrencyCode, type Money } from "./money";
import { err, ok, type DomainError, type Result } from "./result";

/** Cobro de dividendos o intereses que ya ha entrado en una cuenta. */
export interface IncomeEvent {
  readonly date: CalendarDate;
  readonly kind: "dividend" | "interest";
  /** En la moneda del cálculo; una corrección o devolución puede ser negativa. */
  readonly amount: Money;
}

export interface IncomeInput {
  readonly currency: CurrencyCode;
  readonly events: readonly IncomeEvent[];
  /** Meses naturales que se desglosan, contando el actual (1 a 60). */
  readonly months: number;
  /** Valor de la cartera para calcular la rentabilidad por cobros; `null` si no se pide. */
  readonly portfolioValue: Money | null;
  /** "Hoy" en la zona del espacio: la librería no lee el reloj. */
  readonly onDate: CalendarDate;
}

export interface IncomeMonth {
  /** `AAAA-MM`. */
  readonly month: string;
  readonly dividend: Money;
  readonly interest: Money;
  readonly total: Money;
}

export interface Income {
  /** Del más antiguo al actual; incluye los meses sin cobros (a cero). */
  readonly months: readonly IncomeMonth[];
  /** Cobrado en los últimos 365 días (hasta `onDate`, incluida). */
  readonly trailingYear: Money;
  readonly trailingDividends: Money;
  readonly trailingInterest: Money;
  /** Cobros del último año / valor de la cartera; `null` si no hay valor positivo. */
  readonly trailingYield: Decimal | null;
  /** Estimación: lo cobrado el último año, repetido. No es una previsión de cobros reales. */
  readonly nextYearEstimate: Money;
}

export interface IncomeExplanation {
  readonly method: "income.trailing_year";
  readonly eventCount: number;
  readonly windowStart: CalendarDate;
  readonly caveats: readonly string[];
}

export interface IncomeResult {
  readonly value: Income;
  readonly explanation: IncomeExplanation;
}

const YEAR_DAYS = 365;

function monthKey(date: CalendarDate): string {
  return date.slice(0, 7);
}

/** `n` meses antes de un mes `AAAA-MM`. */
function monthsBefore(key: string, n: number): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  const index = year * 12 + (month - 1) - n;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Calendario de cobros: dividendos e intereses por mes y total del último año, con la
 * rentabilidad por cobros sobre el valor de la cartera. Solo cuenta lo ya cobrado; el cobro
 * futuro no se inventa: la cifra de «próximo año» es una estimación explícita (lo cobrado el
 * último año), y así se dice. Cada cifra suma exactamente los eventos que la componen.
 */
export function incomeCalendar(input: IncomeInput): Result<IncomeResult, DomainError> {
  const { currency, onDate } = input;
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 60) {
    return err({ code: "income.months_invalid" });
  }
  if (input.events.some((e) => e.amount.currency !== currency)) {
    return err({ code: "income.currency_mismatch" });
  }
  if (input.portfolioValue !== null && input.portfolioValue.currency !== currency) {
    return err({ code: "income.currency_mismatch" });
  }

  const events = input.events.filter((e) => e.date <= onDate);
  const windowStart = addDays(onDate, -(YEAR_DAYS - 1));
  const current = monthKey(onDate);
  const monthKeys = Array.from({ length: input.months }, (_, i) =>
    monthsBefore(current, input.months - 1 - i),
  );

  const months: IncomeMonth[] = monthKeys.map((month) => {
    const inMonth = events.filter((e) => monthKey(e.date) === month);
    const sumKind = (kind: IncomeEvent["kind"]) =>
      inMonth.filter((e) => e.kind === kind).reduce((acc, e) => add(acc, e.amount), zero(currency));
    const dividend = sumKind("dividend");
    const interest = sumKind("interest");
    return { month, dividend, interest, total: add(dividend, interest) };
  });

  const trailing = events.filter((e) => e.date >= windowStart);
  const sumTrailing = (kind: IncomeEvent["kind"]) =>
    trailing.filter((e) => e.kind === kind).reduce((acc, e) => add(acc, e.amount), zero(currency));
  const trailingDividends = sumTrailing("dividend");
  const trailingInterest = sumTrailing("interest");
  const trailingYear = add(trailingDividends, trailingInterest);

  const base = input.portfolioValue;
  const trailingYield =
    base !== null && base.minor > 0n ? toDecimal(trailingYear).div(toDecimal(base)) : null;

  const caveats = ["income.caveat.estimate_is_not_forecast"];
  if (events.length === 0) caveats.push("income.caveat.no_events");
  else if (events.every((e) => e.date > windowStart)) caveats.push("income.caveat.short_history");
  if (trailingYield === null) caveats.push("income.caveat.no_portfolio_value");

  return ok({
    value: {
      months,
      trailingYear,
      trailingDividends,
      trailingInterest,
      trailingYield,
      nextYearEstimate: trailingYear,
    },
    explanation: {
      method: "income.trailing_year",
      eventCount: trailing.length,
      windowStart,
      caveats,
    },
  });
}

import { compareDates, type CalendarDate } from "./calendar-date";
import type { Decimal } from "./decimal";
import { add, sub, toDecimal, zero, type CurrencyCode, type Money } from "./money";
import type { ExternalFlow } from "./returns";
import { err, ok, type DomainError, type Result } from "./result";

export interface ValuePoint {
  readonly date: CalendarDate;
  readonly value: Money;
}

export interface PerformanceInput {
  readonly currency: CurrencyCode;
  /** Valoraciones de la cuenta (o del conjunto), en cualquier orden. */
  readonly valuations: readonly ValuePoint[];
  /** Aportaciones (+) y retiradas (−) externas, en la misma moneda. */
  readonly flows: readonly ExternalFlow[];
  /** Inicio de la ventana visible; `null` = desde la primera aportación. */
  readonly from: CalendarDate | null;
  /** "Hoy" en la zona del espacio: la librería no lee el reloj. */
  readonly onDate: CalendarDate;
}

export interface PerformancePoint {
  readonly date: CalendarDate;
  readonly value: Money;
  /** Aportado neto acumulado (aportaciones − retiradas) hasta esa fecha. */
  readonly contributed: Money;
  /** Ganancia acumulada: valor − aportado neto. */
  readonly gain: Money;
  /** Ganancia / aportado (0,05 = 5 %); `null` si lo aportado no es positivo. */
  readonly ratio: Decimal | null;
}

export interface PerformanceExplanation {
  readonly method: "performance.cumulative_simple";
  /** Primera fecha mostrada. */
  readonly start: CalendarDate;
  readonly caveats: readonly string[];
}

export interface Performance {
  readonly points: readonly PerformancePoint[];
  readonly explanation: PerformanceExplanation;
}

/**
 * Evolución de la rentabilidad acumulada: en cada fecha con valoración, ganancia = valor −
 * aportado neto y rentabilidad = ganancia / aportado neto (la misma que muestran los bancos).
 * No es anualizada ni compara periodos: la ventana `from` solo recorta lo que se ve, de modo
 * que un punto vale lo mismo en cualquier ventana. Las valoraciones anteriores a la primera
 * aportación no se muestran.
 */
export function performanceSeries(input: PerformanceInput): Result<Performance, DomainError> {
  const { currency, onDate } = input;
  const flows = [...input.flows]
    .filter((f) => f.date <= onDate)
    .sort((a, b) => compareDates(a.date, b.date));
  const firstFlow = flows[0];
  if (!firstFlow) return err({ code: "performance.no_flows" });

  const valuations = [...input.valuations]
    .filter((v) => v.date <= onDate && v.date >= firstFlow.date)
    .sort((a, b) => compareDates(a.date, b.date));
  if (valuations.length === 0) return err({ code: "performance.no_valuations" });

  const points: PerformancePoint[] = [];
  let contributed = zero(currency);
  let next = 0;
  for (const v of valuations) {
    // Los flujos del mismo día cuentan: la valoración es posterior a la operación.
    for (; next < flows.length && (flows[next] as ExternalFlow).date <= v.date; next += 1) {
      contributed = add(contributed, (flows[next] as ExternalFlow).amount);
    }
    if (input.from !== null && v.date < input.from) continue;
    const gain = sub(v.value, contributed);
    points.push({
      date: v.date,
      value: v.value,
      contributed,
      gain,
      ratio: contributed.minor > 0n ? toDecimal(gain).div(toDecimal(contributed)) : null,
    });
  }

  const first = points[0];
  if (!first) return err({ code: "performance.no_valuations" });
  const caveats = ["performance.caveat.not_annualized"];
  if (valuations[0] && valuations[0].date > firstFlow.date) {
    caveats.push("performance.caveat.no_values_before_first");
  }
  return ok({
    points,
    explanation: { method: "performance.cumulative_simple", start: first.date, caveats },
  });
}

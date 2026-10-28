import { compareDates, type CalendarDate } from "./calendar-date";
import { convert, type FxRate } from "./fx";
import { add, money, negate, zero, type CurrencyCode, type Money } from "./money";
import type { DomainError } from "./result";
import type { ExternalFlow, ValuePoint } from "./returns";

/** Pata del libro tal como la lee la web: `role` de `transaction_legs` + fecha y tipo de su movimiento. */
export interface LedgerLeg {
  readonly transactionId: string;
  readonly date: CalendarDate;
  /** `transactions.kind`: contribution, withdrawal, internal_transfer, buy, dividend… */
  readonly kind: string;
  readonly role: "cash" | "position" | "external" | "fee" | "tax";
  /** Obligatorio en las patas `cash` y `position`; nulo en `external`, `fee` y `tax`. */
  readonly accountId: string | null;
  /** Con signo del libro: positivo aumenta la cuenta; en `external`, positivo = sale dinero. */
  readonly amount: Money;
}

/**
 * Movimientos que cruzan el borde del ámbito pero **no** son aportaciones ni retiradas:
 * son rendimiento (dividendos, intereses, ajustes) o coste (comisiones, impuestos). Suben o
 * bajan el valor de la cuenta, así que forman parte de la rentabilidad, no de los flujos.
 */
export const NON_FLOW_KINDS: readonly string[] = [
  "dividend",
  "interest",
  "adjustment",
  "fee",
  "tax",
];

export interface ExternalFlowsInput {
  readonly legs: readonly LedgerLeg[];
  /** Cuentas del ámbito (una cuenta, un conjunto de cuentas…). */
  readonly scope: readonly string[];
  /** Moneda en la que se devuelven los flujos (la de la cuenta, o la base del espacio). */
  readonly currency: CurrencyCode;
  readonly fxRates: readonly FxRate[];
}

export interface ExternalFlowsResult {
  readonly value: readonly ExternalFlow[];
  readonly explanation: {
    readonly method: "ledger.external_flows";
    readonly assumptions: readonly string[];
    /** Movimientos que tocan el ámbito pero no se pudieron convertir a la moneda pedida. */
    readonly skipped: readonly ({ readonly transactionId: string } & DomainError)[];
    readonly quality: { readonly level: "complete" | "partial" };
  };
}

/**
 * Flujos externos del ámbito: aportaciones (> 0) y retiradas (< 0) respecto a un conjunto de
 * cuentas. Es el puente entre el libro y la rentabilidad.
 *
 * Un movimiento es flujo del ámbito por lo que **entra o sale del ámbito**: las patas
 * `external` y las de cuentas que no están en él. Así, un traspaso entre dos cuentas del ámbito
 * no es flujo, y uno entre una cuenta del ámbito y otra de fuera sí lo es (AGENTS.md regla 16).
 * Las comisiones e impuestos no son flujo: reducen el valor y por eso restan rentabilidad.
 * Los dividendos e intereses tampoco: son rendimiento (`NON_FLOW_KINDS`).
 */
export function externalFlows(input: ExternalFlowsInput): ExternalFlowsResult {
  const inScope = new Set(input.scope);
  const byTransaction = new Map<string, LedgerLeg[]>();
  for (const leg of input.legs) {
    byTransaction.set(leg.transactionId, [...(byTransaction.get(leg.transactionId) ?? []), leg]);
  }

  const flows: ExternalFlow[] = [];
  const skipped: ({ transactionId: string } & DomainError)[] = [];
  for (const [transactionId, legs] of byTransaction) {
    const first = legs[0] as LedgerLeg;
    const touches = legs.some(
      (l) => (l.role === "cash" || l.role === "position") && inScope.has(l.accountId ?? ""),
    );
    if (!touches || NON_FLOW_KINDS.includes(first.kind)) continue;

    // Lo que queda fuera del ámbito, por moneda: el flujo es lo contrario (el movimiento cuadra a cero).
    const outside = new Map<Money["currency"], Money>();
    for (const leg of legs) {
      const isOutside =
        leg.role === "external" ||
        ((leg.role === "cash" || leg.role === "position") && !inScope.has(leg.accountId ?? ""));
      if (isOutside) {
        const current = outside.get(leg.amount.currency) ?? zero(leg.amount.currency);
        outside.set(leg.amount.currency, add(current, leg.amount));
      }
    }

    let total = zero(input.currency);
    for (const amount of outside.values()) {
      const converted = convert(negate(amount), input.currency, input.fxRates, first.date);
      if (!converted.ok) {
        skipped.push({ transactionId, ...converted.error });
        total = zero(input.currency);
        break;
      }
      total = add(total, converted.value.value);
    }
    if (total.minor !== 0n) flows.push({ date: first.date, amount: total });
  }

  return {
    value: flows.sort((a, b) => compareDates(a.date, b.date)),
    explanation: {
      method: "ledger.external_flows",
      assumptions: [
        "ledger.flows_internal_transfers_excluded",
        "ledger.flows_fees_taxes_are_costs",
        "ledger.flows_dividends_interest_are_returns",
        "ledger.flows_fx_on_movement_date",
      ],
      skipped,
      quality: { level: skipped.length === 0 ? "complete" : "partial" },
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Serie de valor de un conjunto de cuentas
// ---------------------------------------------------------------------------------------------

export interface SeriesAccount {
  readonly accountId: string;
  /** Valoraciones de la cuenta, en su moneda. */
  readonly valuations: readonly ValuePoint[];
  /** Flujos de la cuenta (`externalFlows` con su propia moneda). */
  readonly flows: readonly ExternalFlow[];
}

export interface ValueSeriesInput {
  readonly accounts: readonly SeriesAccount[];
  readonly currency: CurrencyCode;
  readonly fxRates: readonly FxRate[];
}

export interface ValueSeriesResult {
  readonly value: readonly ValuePoint[];
  readonly explanation: {
    readonly method: "ledger.value_series";
    readonly assumptions: readonly string[];
    readonly notes: readonly DomainError[];
    readonly quality: { readonly level: "complete" | "approximate" | "partial" };
  };
}

/**
 * Valor conjunto de varias cuentas en cada fecha en la que alguna se valoró. En cada fecha,
 * una cuenta vale su última valoración más los flujos posteriores a ella (como el patrimonio
 * hace con los movimientos posteriores a la valoración); antes de su primera valoración vale lo
 * aportado hasta entonces (coste), y se avisa. Así un traspaso entre dos cuentas del conjunto
 * mueve valor de una a otra sin cambiar el total.
 */
export function valueSeries(input: ValueSeriesInput): ValueSeriesResult {
  const dates = [...new Set(input.accounts.flatMap((a) => a.valuations.map((v) => v.date)))].sort(
    compareDates,
  );
  const notes: DomainError[] = [];
  const noted = new Set<string>();
  const note = (code: string, accountId: string, date: CalendarDate): void => {
    if (noted.has(`${code}:${accountId}`)) return;
    noted.add(`${code}:${accountId}`);
    notes.push({ code, params: { accountId, date } });
  };

  const points: ValuePoint[] = dates.map((date) => {
    let total = zero(input.currency);
    for (const account of input.accounts) {
      const last = account.valuations
        .filter((v) => compareDates(v.date, date) <= 0)
        .reduce<ValuePoint | undefined>(
          (best, v) => (best && compareDates(best.date, v.date) >= 0 ? best : v),
          undefined,
        );
      const since = account.flows.filter(
        (f) => compareDates(f.date, date) <= 0 && (!last || compareDates(f.date, last.date) > 0),
      );
      if (!last && since.length > 0)
        note("returns.series_cost_basis_used", account.accountId, date);
      const currency = last?.value.currency ?? since[0]?.amount.currency;
      if (currency === undefined) continue;
      const own = since.reduce((acc, f) => add(acc, f.amount), last?.value ?? zero(currency));
      const converted = convert(own, input.currency, input.fxRates, date);
      if (!converted.ok) {
        note("returns.series_fx_missing", account.accountId, date);
        continue;
      }
      total = add(total, converted.value.value);
    }
    return { date, value: money(total.minor, input.currency) };
  });

  const missingFx = notes.some((n) => n.code === "returns.series_fx_missing");
  return {
    value: points,
    explanation: {
      method: "ledger.value_series",
      assumptions: [
        "ledger.series_last_valuation_plus_flows",
        "ledger.series_cost_basis_before_first_valuation",
      ],
      notes,
      quality: { level: missingFx ? "partial" : notes.length > 0 ? "approximate" : "complete" },
    },
  };
}

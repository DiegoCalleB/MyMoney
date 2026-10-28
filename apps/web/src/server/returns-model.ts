import {
  contributedVsGained,
  cpiPoint,
  dec,
  externalFlows,
  realReturn,
  twr,
  valueSeries,
  xirr,
  type CalendarDate,
  type ContributedVsGainedResult,
  type CpiPoint,
  type CurrencyCode,
  type DomainError,
  type ExternalFlow,
  type FxRate,
  type LedgerLeg,
  type RealReturnResult,
  type SeriesAccount,
  type TwrResult,
  type ValuePoint,
  type XirrResult,
  calendarDate,
  isCalendarDate,
  isCurrencyCode,
  money,
} from "@mymoney/finance-core";
import type { AccountKind } from "@mymoney/schemas";
import { z } from "zod";
import {
  accountRow,
  bigintValue,
  decimalText,
  valuationRow,
  type AccountMeta,
  type SpaceRow,
} from "@/server/home-model";

/** Tipos de cuenta de los que tiene sentido calcular una rentabilidad (no una cuenta corriente). */
export const RETURN_KINDS: readonly AccountKind[] = [
  "brokerage",
  "fund_holding",
  "pension_plan",
  "crypto",
  "deposit",
  "savings",
  "real_estate",
  "other_asset",
];

const dateText = z
  .string()
  .refine(isCalendarDate)
  .transform((d) => calendarDate(d));
const currencyText = z.string().refine(isCurrencyCode);

/** Fila de `return_legs` (una pata con la fecha y el tipo de su movimiento) → pata del dominio. */
export const legRow = z
  .object({
    leg_id: z.uuid(),
    transaction_id: z.uuid(),
    occurred_on: dateText,
    kind: z.string(),
    role: z.enum(["cash", "position", "external", "fee", "tax"]),
    account_id: z.uuid().nullable(),
    currency: currencyText,
    amount_minor: bigintValue,
  })
  .transform((r): LedgerLeg => ({
    transactionId: r.transaction_id,
    date: r.occurred_on,
    kind: r.kind,
    role: r.role,
    accountId: r.account_id,
    amount: money(r.amount_minor, r.currency),
  }));

/** Fila de `inflation_index`: índice del primer día del mes. */
export const cpiRow = z.object({ period: dateText, index_value: decimalText });

export interface ReturnsRows {
  readonly space: SpaceRow;
  readonly accounts: readonly z.infer<typeof accountRow>[];
  readonly valuations: readonly z.infer<typeof valuationRow>[];
  readonly legs: readonly LedgerLeg[];
  readonly fxRates: readonly FxRate[];
  readonly cpi: readonly CpiPoint[];
}

/** Un cálculo que puede fallar de forma esperable: o resultado, o el código para explicarlo. */
export type Attempt<T> =
  { readonly ok: true; readonly result: T } | { readonly ok: false; readonly code: string };

export interface ReturnsSummary {
  readonly currency: CurrencyCode;
  readonly from: CalendarDate;
  readonly to: CalendarDate;
  readonly gain: Attempt<ContributedVsGainedResult>;
  readonly xirr: Attempt<XirrResult>;
  readonly twr: Attempt<TwrResult>;
  /** Sobre la TWR si se pudo calcular, y si no sobre la XIRR. */
  readonly real: Attempt<RealReturnResult> & { readonly basis?: "twr" | "xirr" };
  /** Avisos de datos: conversiones que faltan, costes usados antes de valorar… */
  readonly notes: readonly DomainError[];
}

export interface AccountReturns {
  readonly accountId: string;
  readonly summary: ReturnsSummary;
}

export interface ReturnsModel {
  readonly baseCurrency: CurrencyCode;
  readonly accounts: readonly AccountReturns[];
  /** Conjunto de las cuentas con rentabilidad; `null` si hay menos de dos o ninguna valorada. */
  readonly total: ReturnsSummary | null;
  readonly meta: ReadonlyMap<string, AccountMeta>;
}

const attempt = <T>(r: { ok: true; value: T } | { ok: false; error: DomainError }): Attempt<T> =>
  r.ok ? { ok: true, result: r.value } : { ok: false, code: r.error.code };

/**
 * Resume el periodo entre la primera y la última valoración. Si la primera aportación es
 * anterior a la primera valoración, el periodo arranca en ella (el capital inicial son esas
 * aportaciones); si no, arranca en la primera valoración, que ya incluye lo aportado hasta
 * entonces. Los flujos posteriores a la última valoración no entran: el valor es el de esa fecha.
 */
export function summarize(
  valuations: readonly ValuePoint[],
  flows: readonly ExternalFlow[],
  cpi: readonly CpiPoint[],
  notes: readonly DomainError[] = [],
): ReturnsSummary | null {
  const sorted = [...valuations].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return null;

  const upToEnd = flows.filter((f) => f.date <= last.date);
  const firstFlow = upToEnd.reduce<ExternalFlow | undefined>(
    (min, f) => (min && min.date <= f.date ? min : f),
    undefined,
  );
  const opensWithValuation = firstFlow === undefined || firstFlow.date >= first.date;
  const period = {
    ...(opensWithValuation ? { startValue: first } : {}),
    flows: opensWithValuation ? upToEnd.filter((f) => f.date > first.date) : upToEnd,
    endValue: last,
  };

  const twrResult = attempt(
    twr({ valuations: sorted, flows: upToEnd.filter((f) => f.date >= first.date) }),
  );
  const xirrResult = attempt(xirr(period));
  const nominal = twrResult.ok
    ? {
        basis: "twr" as const,
        rate: twrResult.result.value.cumulative,
        from: twrResult.result.explanation.from,
        to: twrResult.result.explanation.to,
      }
    : xirrResult.ok
      ? {
          basis: "xirr" as const,
          rate: xirrResult.result.value.cumulative,
          from: xirrResult.result.explanation.from,
          to: xirrResult.result.explanation.to,
        }
      : undefined;
  const real = nominal
    ? {
        ...attempt(
          realReturn({ nominalCumulative: nominal.rate, from: nominal.from, to: nominal.to, cpi }),
        ),
        basis: nominal.basis,
      }
    : { ok: false as const, code: "returns.no_nominal_return" };

  return {
    currency: last.value.currency,
    from: opensWithValuation ? first.date : firstFlow.date,
    to: last.date,
    gain: attempt(contributedVsGained(period)),
    xirr: xirrResult,
    twr: twrResult,
    real,
    notes,
  };
}

/** Los avisos que llegan a la pantalla no llevan identificadores de movimientos. */
const withoutIds = (items: readonly ({ transactionId: string } & DomainError)[]): DomainError[] =>
  items.map((item) => ({ code: item.code, ...(item.params ? { params: item.params } : {}) }));

/** Rentabilidad de cada cuenta de inversión y del conjunto, en la moneda de cada una y en la base. */
export function buildReturns(rows: ReturnsRows, today: CalendarDate): ReturnsModel {
  const eligible = rows.accounts.filter(
    (a) => a.scope === "household" && !a.is_liability && RETURN_KINDS.includes(a.kind),
  );
  const meta = new Map<string, AccountMeta>(
    eligible.map((a) => [a.id, { name: a.name, kind: a.kind, institutionId: a.institution_id }]),
  );
  const cpi = rows.cpi;

  const series: SeriesAccount[] = [];
  const accounts: AccountReturns[] = [];
  for (const account of eligible) {
    const valuations: ValuePoint[] = rows.valuations
      .filter(
        (v) => v.account_id === account.id && v.currency === account.currency && v.as_of <= today,
      )
      .map((v) => ({ date: v.as_of, value: money(v.value_minor, v.currency) }));
    const flows = externalFlows({
      legs: rows.legs,
      scope: [account.id],
      currency: account.currency,
      fxRates: rows.fxRates,
    });
    series.push({ accountId: account.id, valuations, flows: flows.value });
    const skipped = withoutIds(flows.explanation.skipped);
    const summary = summarize(valuations, flows.value, cpi, skipped);
    if (summary) accounts.push({ accountId: account.id, summary });
  }

  let total: ReturnsSummary | null = null;
  if (series.filter((s) => s.valuations.length > 0).length >= 2) {
    const ids = series.map((s) => s.accountId);
    const flows = externalFlows({
      legs: rows.legs,
      scope: ids,
      currency: rows.space.base_currency,
      fxRates: rows.fxRates,
    });
    const values = valueSeries({
      accounts: series,
      currency: rows.space.base_currency,
      fxRates: rows.fxRates,
    });
    total = summarize(values.value, flows.value, cpi, [
      ...values.explanation.notes,
      ...withoutIds(flows.explanation.skipped),
    ]);
  }
  return { baseCurrency: rows.space.base_currency, accounts, total, meta };
}

/** Convierte las filas de IPC en puntos mensuales ("2026-08" → índice). */
export function cpiPoints(rows: readonly z.infer<typeof cpiRow>[]): CpiPoint[] {
  return rows.map((r) => cpiPoint(r.period.slice(0, 7), dec(r.index_value).toString()));
}

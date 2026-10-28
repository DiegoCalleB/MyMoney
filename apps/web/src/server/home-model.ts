import {
  calendarDate,
  dec,
  isCalendarDate,
  isCurrencyCode,
  money,
  type AccountInput,
  type CalendarDate,
  type CurrencyCode,
  type FxRate,
  type NetWorthInput,
  type PocketAllocationInput,
} from "@mymoney/finance-core";
import { ACCOUNT_KINDS, type AccountKind } from "@mymoney/schemas";
import { z } from "zod";

/**
 * Filas tal como las devuelve la base de datos, validadas antes de calcular nada. Si una fila
 * no encaja, se falla en lugar de mostrar una cifra de dinero que podría ser errónea.
 */
const currency = z.string().refine(isCurrencyCode);
const date = z
  .string()
  .refine(isCalendarDate)
  .transform((d) => calendarDate(d));

/**
 * bigint: PostgREST lo devuelve como número JSON. Solo se acepta un entero seguro (±2^53): si
 * un importe lo superara, se falla en lugar de redondear en silencio. También se admite texto
 * por si la fuente cambia.
 */
const bigintValue = z
  .union([z.string().regex(/^-?\d{1,18}$/), z.number().refine(Number.isSafeInteger)])
  .transform((v) => BigInt(v));

const decimalText = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^\d+(\.\d+)?$/));

export const spaceRow = z.object({
  id: z.uuid(),
  name: z.string(),
  base_currency: currency,
  timezone: z.string(),
});
export type SpaceRow = z.infer<typeof spaceRow>;

export const accountRow = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(ACCOUNT_KINDS),
  is_liability: z.boolean(),
  currency,
  scope: z.enum(["household", "external"]),
  closed_on: date.nullable(),
});

export const balanceRow = z.object({
  account_id: z.uuid(),
  currency,
  balance_minor: bigintValue,
});

export const valuationRow = z.object({
  account_id: z.uuid(),
  as_of: date,
  value_minor: bigintValue,
  currency,
});

export const movementsAfterRow = z.object({
  account_id: z.uuid(),
  currency,
  delta_minor: bigintValue,
  last_on: date,
});

export const fxRow = z.object({
  base: currency,
  quote: currency,
  as_of: date,
  rate: decimalText,
  source: z.string(),
});

export const pocketRow = z.object({ id: z.uuid(), name: z.string() });

export const allocationRow = z.object({
  pocket_id: z.uuid(),
  account_id: z.uuid(),
  asset_id: z.uuid().nullable(),
  weight_bps: z.number().int(),
});

export const noticeRow = z.object({
  id: z.uuid(),
  message_key: z.string(),
  message_params: z.record(z.string(), z.unknown()),
  severity: z.enum(["info", "attention", "important"]),
});
export type NoticeRow = z.infer<typeof noticeRow>;

export interface HomeRows {
  readonly space: SpaceRow;
  readonly accounts: readonly z.infer<typeof accountRow>[];
  readonly balances: readonly z.infer<typeof balanceRow>[];
  readonly valuations: readonly z.infer<typeof valuationRow>[];
  /** Movimientos posteriores a la última valoración de cada cuenta (ver finance-core). */
  readonly movementsAfter?: readonly z.infer<typeof movementsAfterRow>[] | undefined;
  readonly fxRates: readonly z.infer<typeof fxRow>[];
  readonly allocations: readonly z.infer<typeof allocationRow>[];
}

export interface AccountMeta {
  readonly name: string;
  readonly kind: AccountKind;
}

export interface HomeModel {
  readonly input: NetWorthInput;
  readonly accounts: ReadonlyMap<string, AccountMeta>;
}

/**
 * Arma la entrada del cálculo de patrimonio. Solo cuentan las cuentas del hogar y no cerradas
 * (`external` se muestra aparte, no suma). Se toma la última valoración de cada cuenta hasta
 * hoy; el saldo de movimientos se usa cuando no hay valoración (finance-core decide la
 * preferencia y la deja explicada).
 */
export function buildHomeModel(rows: HomeRows, today: CalendarDate): HomeModel {
  const included = rows.accounts.filter(
    (a) => a.scope === "household" && (a.closed_on === null || a.closed_on > today),
  );

  const latestValuation = new Map<string, (typeof rows.valuations)[number]>();
  for (const v of rows.valuations) {
    if (v.as_of > today) continue;
    const current = latestValuation.get(v.account_id);
    if (!current || v.as_of > current.as_of) latestValuation.set(v.account_id, v);
  }

  const accounts: AccountInput[] = included.map((a) => {
    const cash = rows.balances.filter((b) => b.account_id === a.id && b.currency === a.currency);
    const valuation = latestValuation.get(a.id);
    // Solo se suman movimientos en la moneda de la valoración: nunca se mezclan monedas.
    const after = rows.movementsAfter?.find(
      (m) => m.account_id === a.id && valuation && m.currency === valuation.currency,
    );
    return {
      accountId: a.id,
      isLiability: a.is_liability,
      ...(cash.length > 0
        ? {
            ledger: {
              amount: money(
                cash.reduce((sum, b) => sum + b.balance_minor, 0n),
                a.currency,
              ),
              asOf: today,
            },
          }
        : {}),
      ...(valuation
        ? {
            valuation: {
              amount: money(valuation.value_minor, valuation.currency),
              asOf: valuation.as_of,
            },
          }
        : {}),
      ...(valuation && after
        ? {
            movementsAfterValuation: {
              amount: money(after.delta_minor, after.currency),
              asOf: after.last_on,
            },
          }
        : {}),
    };
  });

  const ids = new Set(included.map((a) => a.id));
  const allocations: PocketAllocationInput[] = rows.allocations
    .filter((a) => ids.has(a.account_id))
    .map((a) => ({
      pocketId: a.pocket_id,
      accountId: a.account_id,
      assetId: a.asset_id,
      weightBps: a.weight_bps,
    }));

  const fxRates: FxRate[] = rows.fxRates.map((r) => ({
    base: r.base,
    quote: r.quote,
    asOf: r.as_of,
    rate: dec(r.rate),
    source: r.source,
  }));

  return {
    input: {
      baseCurrency: rows.space.base_currency,
      onDate: today,
      accounts,
      allocations,
      fxRates,
    },
    accounts: new Map(included.map((a) => [a.id, { name: a.name, kind: a.kind }])),
  };
}

/** Monedas distintas de la base presentes en las cuentas: las que necesitan tipo de cambio. */
export function foreignCurrencies(
  rows: Pick<HomeRows, "accounts" | "valuations" | "space">,
): CurrencyCode[] {
  const found = new Set<CurrencyCode>();
  for (const a of rows.accounts) found.add(a.currency);
  for (const v of rows.valuations) found.add(v.currency);
  found.delete(rows.space.base_currency);
  return [...found];
}

/** Parámetros de aviso: solo cadenas cortas; cualquier otra cosa se descarta. */
export function noticeParams(row: NoticeRow): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.message_params)) {
    if (typeof value === "string" && value.length <= 80) params[key] = value;
  }
  return params;
}

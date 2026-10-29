import {
  dec,
  isCurrencyCode,
  money,
  type CalendarDate,
  type CurrencyCode,
  type ParameterSource,
  type TaxBracket,
} from "@mymoney/finance-core";
import { z } from "zod";
import type { ExternalFlowRow } from "@/server/home-model";

/** Fila de la vista `tax_parameters` (parámetros legales con su fuente). */
export const taxParameterRow = z.object({
  key: z.string(),
  fiscal_year: z.number().int(),
  value: z.unknown(),
  source_url: z.string(),
  verified_on: z.string(),
});
export type TaxParameterRow = z.infer<typeof taxParameterRow>;

/** Importe en unidades mínimas que puede llegar como número o como texto dentro del JSON. */
const minor = z
  .union([
    z.string().regex(/^\d{1,18}$/),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform((v) => BigInt(v));
const currency = z.string().refine(isCurrencyCode);
const rate = z
  .string()
  .regex(/^(0(\.\d{1,4})?|1(\.0{1,4})?)$/)
  .transform((v) => dec(v));

/** `pension_individual_limit`: `{ "amount_minor": 150000, "currency": "EUR" }`. */
const pensionLimitValue = z.object({ amount_minor: minor, currency });

/**
 * `savings_brackets`: `{ "currency": "EUR", "brackets": [{ "up_to_minor": 600000, "rate": "0.19" },
 * …, { "up_to_minor": null, "rate": "0.28" }] }`. Los tipos van como texto: nunca como `number`.
 */
const savingsBracketsValue = z.object({
  currency,
  brackets: z
    .array(z.object({ up_to_minor: minor.nullable(), rate }))
    .min(1)
    .max(20),
});

function sourceOf(row: TaxParameterRow): ParameterSource {
  return { fiscalYear: row.fiscal_year, sourceUrl: row.source_url, verifiedOn: row.verified_on };
}

export interface PensionLimit {
  readonly limit: ReturnType<typeof money>;
  readonly source: ParameterSource;
}
export interface SavingsScale {
  readonly currency: CurrencyCode;
  readonly brackets: readonly TaxBracket[];
  readonly source: ParameterSource;
}

/** El límite de aportación del ejercicio, o null si falta o no tiene la forma esperada. */
export function pensionLimitFrom(rows: readonly TaxParameterRow[]): PensionLimit | null {
  const row = rows.find((r) => r.key === "pension_individual_limit");
  const parsed = pensionLimitValue.safeParse(row?.value);
  if (!row || !parsed.success) return null;
  return {
    limit: money(parsed.data.amount_minor, parsed.data.currency),
    source: sourceOf(row),
  };
}

/** La escala de la base del ahorro del ejercicio, o null si falta o no tiene la forma esperada. */
export function savingsScaleFrom(rows: readonly TaxParameterRow[]): SavingsScale | null {
  const row = rows.find((r) => r.key === "savings_brackets");
  const parsed = savingsBracketsValue.safeParse(row?.value);
  if (!row || !parsed.success) return null;
  const cur = parsed.data.currency;
  return {
    currency: cur,
    brackets: parsed.data.brackets.map((b) => ({
      upTo: b.up_to_minor === null ? null : money(b.up_to_minor, cur),
      rate: b.rate,
    })),
    source: sourceOf(row),
  };
}

/**
 * Aportaciones (solo entradas) a las cuentas indicadas en el ejercicio de `today`, en la moneda
 * pedida. Las retiradas no restan del límite de aportación.
 */
export function contributedInYear(
  flows: readonly ExternalFlowRow[],
  accountIds: ReadonlySet<string>,
  today: CalendarDate,
  cur: CurrencyCode,
): ReturnType<typeof money> {
  const start = `${today.slice(0, 4)}-01-01`;
  const total = flows
    .filter(
      (f) =>
        accountIds.has(f.account_id) &&
        f.currency === cur &&
        f.amount_minor > 0n &&
        f.occurred_on >= start &&
        f.occurred_on <= today,
    )
    .reduce((sum, f) => sum + f.amount_minor, 0n);
  return money(total, cur);
}

/** Aportado neto (entradas − salidas) de una cuenta, en su moneda. */
export function netContributed(
  flows: readonly ExternalFlowRow[],
  accountId: string,
  cur: CurrencyCode,
): ReturnType<typeof money> {
  return money(
    flows
      .filter((f) => f.account_id === accountId && f.currency === cur)
      .reduce((sum, f) => sum + f.amount_minor, 0n),
    cur,
  );
}

/**
 * Porcentaje escrito por una persona ("1,5", "0.20") → puntos básicos enteros, sin pasar por
 * `number`. Hasta dos decimales; nada más se acepta.
 */
export function parsePercentToBps(text: string | undefined): number | null {
  const match = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec((text ?? "").trim());
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

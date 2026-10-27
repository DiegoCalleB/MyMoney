import { z } from "zod";
import { amountText, currencyCode, name, uuid } from "./common";

/** Tipos de cuenta de `public.accounts.kind`. */
export const ACCOUNT_KINDS = [
  "current",
  "savings",
  "deposit",
  "cash",
  "brokerage",
  "fund_holding",
  "pension_plan",
  "crypto",
  "real_estate",
  "vehicle",
  "other_asset",
  "mortgage",
  "loan",
  "credit_card",
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** Igual que la columna generada `accounts.is_liability`. */
export const LIABILITY_KINDS = [
  "mortgage",
  "loan",
  "credit_card",
] as const satisfies readonly AccountKind[];

export function isLiabilityKind(kind: AccountKind): boolean {
  return (LIABILITY_KINDS as readonly AccountKind[]).includes(kind);
}

/**
 * Alta rápida de una cuenta (asistente de primeros pasos): solo nombre, tipo, moneda y valor
 * actual. En las deudas, `currentValue` es lo que se debe, en positivo.
 */
export const addAccountInput = z.object({
  spaceId: uuid,
  name,
  kind: z.enum(ACCOUNT_KINDS, { error: "validation.account_kind_invalid" }),
  currency: currencyCode,
  currentValue: amountText,
});
export type AddAccountInput = z.infer<typeof addAccountInput>;

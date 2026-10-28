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
  /** Entidad donde está la cuenta (banco, bróker…). Opcional: agrupa las cuentas en el inicio. */
  institution: z.string().trim().max(80, { error: "validation.name_too_long" }).optional(),
});
export type AddAccountInput = z.infer<typeof addAccountInput>;

export type Liquidity = "immediate" | "days" | "months" | "illiquid";

/** Liquidez por defecto al crear una cuenta: la persona no tiene que decidirla (regla 25). */
export function defaultLiquidity(kind: AccountKind): Liquidity {
  switch (kind) {
    case "real_estate":
    case "vehicle":
    case "other_asset":
    case "pension_plan":
      return "illiquid";
    case "deposit":
      return "months";
    case "brokerage":
    case "fund_holding":
    case "crypto":
      return "days";
    default:
      return "immediate";
  }
}

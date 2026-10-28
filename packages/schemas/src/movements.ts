import { z } from "zod";
import { amountText, uuid } from "./common";

/** Fecha contable escrita como AAAA-MM-DD; que exista de verdad lo comprueba finance-core. */
export const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "validation.date_invalid" });

export const MOVEMENT_KINDS = [
  "expense",
  "income",
  "transfer",
  "contribution",
  "withdrawal",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/**
 * Apunte manual de un gasto, ingreso, traspaso entre cuentas propias, aportación o retirada. El importe se
 * escribe siempre en positivo: el sentido lo da el tipo. Un traspaso necesita cuenta de destino
 * distinta de la de origen.
 */
export const addMovementInput = z
  .object({
    spaceId: uuid,
    kind: z.enum(MOVEMENT_KINDS, { error: "movement.kind_invalid" }),
    accountId: uuid,
    toAccountId: z.union([uuid, z.literal("")]).optional(),
    amount: amountText,
    occurredOn: isoDate,
    description: z.string().trim().max(200, { error: "movement.description_too_long" }).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "transfer") return;
    if (!value.toAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "movement.to_account_required",
      });
    } else if (value.toAccountId === value.accountId) {
      ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "movement.same_account" });
    }
  });
export type AddMovementInput = z.infer<typeof addMovementInput>;

/** Actualización de valores: la fecha de la valoración; los importes llegan campo a campo. */
export const updateValuesInput = z.object({ spaceId: uuid, asOf: isoDate });
export type UpdateValuesInput = z.infer<typeof updateValuesInput>;

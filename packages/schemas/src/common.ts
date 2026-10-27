import { z } from "zod";

/**
 * Los mensajes de error son claves estables del catálogo de textos (`apps/web/src/messages`),
 * no frases: la web las traduce y nunca muestra el detalle técnico.
 */
export const uuid = z.uuid({ error: "validation.invalid_id" });

/** Código ISO 4217. Que la moneda esté soportada lo comprueba el servidor con finance-core. */
export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { error: "validation.currency_invalid" });

/**
 * Importe tal como lo escribe una persona ("1.234,56"). Viaja como texto y se convierte en el
 * servidor con `parseAmount` de finance-core: nunca pasa por `number` (regla 13).
 */
export const amountText = z
  .string()
  .trim()
  .min(1, { error: "validation.amount_required" })
  .max(32, { error: "validation.amount_invalid" })
  .regex(/^[+-]?[\d.,\s]+$/, { error: "validation.amount_invalid" });

export const name = z
  .string()
  .trim()
  .min(1, { error: "validation.name_required" })
  .max(80, { error: "validation.name_too_long" });

import { z } from "zod";
import { uuid } from "./common";

/** Primer paso de Binance: elegir la cuenta de MyMoney que alimentará la conexión. */
export const startBinanceInput = z.object({ spaceId: uuid, accountId: uuid });
export type StartBinanceInput = z.infer<typeof startBinanceInput>;

// Las claves de acceso de Binance son alfanuméricas (64 caracteres); se admite un margen. Nunca se
// registra ni se devuelve: solo atraviesa la web hasta la función que la valida.
export const BINANCE_API_KEY = /^[A-Za-z0-9]{32,128}$/;

export const finishBinanceInput = z.object({
  spaceId: uuid,
  connectionId: uuid,
  apiKey: z.string().trim().regex(BINANCE_API_KEY, { error: "connections.api_key_invalid" }),
});
export type FinishBinanceInput = z.infer<typeof finishBinanceInput>;

/** Cualquier acción sobre una conexión existente (sincronizar, revocar). */
export const connectionActionInput = z.object({ spaceId: uuid, connectionId: uuid });
export type ConnectionActionInput = z.infer<typeof connectionActionInput>;

/** Primer paso del banco (PSD2): el banco elegido y su país. Solo se aceptan nombres que la función devuelve en su lista. */
export const startBankInput = z.object({
  spaceId: uuid,
  country: z.string().regex(/^[A-Z]{2}$/, { error: "connections.bank.country_invalid" }),
  bank: z
    .string()
    .trim()
    .min(1, { error: "connections.bank.bank_invalid" })
    .max(100, { error: "connections.bank.bank_invalid" }),
});
export type StartBankInput = z.infer<typeof startBankInput>;

/** Vincular las cuentas del banco a las de la persona (el resto de campos son `account:<uid>`). */
export const linkBankInput = z.object({ spaceId: uuid, connectionId: uuid });
export type LinkBankInput = z.infer<typeof linkBankInput>;

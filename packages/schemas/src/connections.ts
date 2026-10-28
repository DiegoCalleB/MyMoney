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

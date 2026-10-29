import { z } from "zod";

/** Estados de una conexión tal como los guarda la base de datos. */
export const CONNECTION_STATUSES = [
  "pending",
  "active",
  "needs_attention",
  "expired",
  "revoked",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const connectionRow = z.object({
  id: z.uuid(),
  provider: z.enum(["enable_banking", "binance", "etoro"]),
  status: z.enum(CONNECTION_STATUSES),
  last_success_at: z.string().nullable(),
  last_error_code: z.string().nullable(),
  consent_expires_at: z.string().nullable(),
});
export type ConnectionRow = z.infer<typeof connectionRow>;

export const connectionAccountRow = z.object({
  connection_id: z.uuid(),
  account_id: z.uuid(),
});

/** Código de error de la Edge Function → clave del catálogo; lo desconocido es un fallo genérico. */
const EDGE_ERRORS: Readonly<Record<string, string>> = {
  key_not_readonly: "connections.error.key_not_readonly",
  key_rejected: "connections.error.key_rejected",
  invalid_api_key: "connections.api_key_invalid",
  forbidden: "connections.error.forbidden",
  not_found: "connections.error.state",
  not_pending: "connections.error.state",
  no_key_pair: "connections.error.state",
  secret_unreadable: "connections.error.state",
  provider_unreachable: "connections.error.provider_unreachable",
  provider_failed: "connections.error.provider_unreachable",
  state_mismatch: "connections.error.state",
  state_expired: "connections.error.state",
  no_session: "connections.error.state",
};

/** Cuenta del banco tal como la devuelve la función: identificador opaco, pista y moneda. */
export const bankAccount = z.object({
  uid: z.string().min(1).max(100),
  hint: z.string().max(20),
  currency: z.string().max(3),
});
export type BankAccount = z.infer<typeof bankAccount>;

export const bankList = z.object({
  banks: z.array(z.object({ name: z.string().min(1).max(100), country: z.string().length(2) })),
});

/** Parámetros con los que el banco vuelve a la aplicación: el state lleva el id de la conexión. */
export const bankReturn = z.object({
  code: z.string().regex(/^[A-Za-z0-9._~:-]{1,512}$/),
  state: z.string().regex(/^[0-9a-f-]{36}\.[0-9a-f]{32}$/),
});

/** Id de la conexión contenido en el `state` (ya validado con `bankReturn`). */
export function connectionIdFromState(state: string): string {
  return state.slice(0, 36);
}

export function edgeErrorKey(code: string): string {
  return EDGE_ERRORS[code] ?? "connections.error.failed";
}

/** Una clave rechazada por permisos de más cancela la conexión: hay que empezar de nuevo. */
export function edgeErrorCancels(code: string): boolean {
  return code === "key_not_readonly";
}

/** Resultado de pedir una sincronización → mensaje que se enseña al volver a la lista. */
export function syncNoticeKey(reason: string | undefined): string | null {
  switch (reason) {
    case "queued":
      return "connections.sync.queued";
    case "too_soon":
      return "connections.sync.too_soon";
    case "already_queued":
      return "connections.sync.already_queued";
    case "error":
      return "connections.sync.error";
    default:
      return null;
  }
}

/** Aviso corto de lo que pasa con la conexión, o null si todo va bien. */
export function connectionAttentionKey(row: ConnectionRow): string | null {
  switch (row.status) {
    case "needs_attention":
      return "connections.attention.needs_attention";
    case "expired":
      return "connections.attention.expired";
    case "pending":
      return "connections.attention.pending";
    default:
      return null;
  }
}

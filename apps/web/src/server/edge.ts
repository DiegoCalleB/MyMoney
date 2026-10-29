import "server-only";
import type { PublicEnv } from "@/lib/env";

export type EdgeResult =
  | { readonly ok: true; readonly data: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly status: number; readonly error: string };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ConnectBinanceBody {
  readonly action: "start" | "finish";
  readonly connection_id: string;
  readonly api_key?: string;
}

export interface ConnectBankBody {
  readonly action: "banks" | "start" | "finish" | "accounts";
  readonly connection_id?: string;
  readonly country?: string;
  readonly bank_name?: string;
  readonly state?: string;
  readonly code?: string;
}

/**
 * Llama a una Edge Function de conexiones con el JWT de la persona: ella decide si puede
 * gestionar la conexión (RLS y segundo factor); la clave secreta solo existe allí (regla 3). El
 * cuerpo (con la clave de acceso) no se registra y la respuesta solo se lee por su código.
 */
async function callEdge(
  name: "connect-binance" | "connect-bank",
  env: PublicEnv,
  accessToken: string,
  body: ConnectBinanceBody | ConnectBankBody,
  fetchFn: Fetch,
): Promise<EdgeResult> {
  let response: Response;
  try {
    response = await fetchFn(`${env.url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        apikey: env.publishableKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, error: "provider_unreachable" };
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Respuesta sin JSON: se trata como un fallo genérico.
  }
  const record =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  if (response.ok) return { ok: true, data: record };
  const error = typeof record.error === "string" ? record.error : "unknown";
  return { ok: false, status: response.status, error };
}

export const callConnectBinance = (
  env: PublicEnv,
  accessToken: string,
  body: ConnectBinanceBody,
  fetchFn: Fetch = fetch,
): Promise<EdgeResult> => callEdge("connect-binance", env, accessToken, body, fetchFn);

export const callConnectBank = (
  env: PublicEnv,
  accessToken: string,
  body: ConnectBankBody,
  fetchFn: Fetch = fetch,
): Promise<EdgeResult> => callEdge("connect-bank", env, accessToken, body, fetchFn);

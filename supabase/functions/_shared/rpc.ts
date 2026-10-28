// Cliente mínimo de las funciones RPC de PostgREST. No registra nada: ni cuerpos, ni cabeceras.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface RpcConfig {
  readonly supabaseUrl: string;
  /** Clave secreta de Supabase (solo dentro de la Edge Function, regla 3). */
  readonly serviceKey: string;
}

export interface RpcResult<T> {
  readonly ok: boolean;
  readonly status: number;
  /** Cuerpo ya interpretado; `null` si la respuesta no trae JSON. */
  readonly data: T | null;
}

const TIMEOUT_MS = 15_000;

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Llama a una función con la clave del servidor. */
export async function serviceRpc<T>(
  config: RpcConfig,
  fetchFn: Fetch,
  name: string,
  body: Readonly<Record<string, unknown>>,
): Promise<RpcResult<T>> {
  const response = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      authorization: `Bearer ${config.serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { ok: response.ok, status: response.status, data: (await readJson(response)) as T | null };
}

/** Llama a una función con el JWT de la persona: manda la RLS, no el servidor. */
export async function userRpc<T>(
  config: { readonly supabaseUrl: string; readonly publishableKey: string },
  fetchFn: Fetch,
  userJwt: string,
  name: string,
  body: Readonly<Record<string, unknown>>,
): Promise<RpcResult<T>> {
  const response = await fetchFn(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      authorization: `Bearer ${userJwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { ok: response.ok, status: response.status, data: (await readJson(response)) as T | null };
}

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

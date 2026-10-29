// Dobles de prueba: un fetch con rutas y una base de datos de secretos en memoria.
import { toBase64 } from "../_shared/bytes.ts";
import { generateKeypair } from "../_shared/binance.ts";
import { importKek, type Kek } from "../_shared/vault.ts";

export interface Call {
  readonly url: string;
  readonly name: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

export type Handler = (call: Call) => Response | Promise<Response>;

export function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * fetch de prueba. La clave de cada ruta es `rpc:<función>` para PostgREST o un trozo de la URL
 * para el resto; la primera que encaje responde. Guarda todas las llamadas.
 */
export function fakeFetch(handlers: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetchFn = async (input: string, init?: RequestInit): Promise<Response> => {
    const rpc = /\/rest\/v1\/rpc\/([a-z_]+)$/.exec(input)?.[1];
    const name = rpc ? `rpc:${rpc}` : input;
    const call: Call = {
      url: input,
      name,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    };
    calls.push(call);
    const key = Object.keys(handlers).find((k) => (rpc ? k === name : input.includes(k)));
    if (!key) return reply(404, { error: "sin ruta en el doble de prueba", input });
    return (handlers[key] as Handler)(call);
  };
  return { calls, fetchFn, named: (name: string) => calls.filter((c) => c.name === name) };
}

export const CONNECTION_ID = "0b4c7f0e-5a52-4a6c-8b53-1f1f6f2a9c01";
export const SPACE_ID = "7d9f1c0a-2b3c-4d5e-8f60-123456789abc";
export const SERVICE_KEY = "clave-servicio-de-prueba";

const b64 = (fill: number) => toBase64(new Uint8Array(32).fill(fill));

export async function testKeks(): Promise<{
  current: Kek;
  byVersion: ReadonlyMap<number, Kek>;
}> {
  const current = await importKek(b64(5), 1);
  return { current, byVersion: new Map([[1, current]]) };
}

/** Rutas de PostgREST que implementan en memoria la bóveda de secretos. */
export function vaultRoutes(initial?: Record<string, unknown> | null) {
  const state: { row: Record<string, unknown> | null } = { row: null };
  const routes: Record<string, Handler> = {
    "rpc:put_connection_secret": (call) => {
      state.row = {
        space_id: SPACE_ID,
        ciphertext: call.body.p_ciphertext,
        nonce: call.body.p_nonce,
        wrapped_dek: call.body.p_wrapped_dek,
        wrap_nonce: call.body.p_wrap_nonce,
        kek_version: call.body.p_kek_version,
        provider: "binance",
      };
      return reply(200, null);
    },
    "rpc:get_connection_secret": () => reply(200, state.row ? [state.row] : []),
  };
  return { state, routes, initial };
}

export async function newKeyPair() {
  return generateKeypair();
}

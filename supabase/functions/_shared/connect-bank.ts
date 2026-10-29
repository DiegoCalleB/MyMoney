// Conexión de un banco por PSD2 con Enable Banking, en pasos. La web llama con el JWT de la persona;
// aquí se comprueban permisos con ese JWT y solo después se usa la clave del servidor.
//   banks    → lista de bancos de un país.
//   start    → guarda un `state` (10 min) y devuelve la dirección del banco para dar el permiso.
//   finish   → recibe `state` y `code` del retorno, abre la sesión, guarda el identificador cifrado y
//              activa la conexión (caduca con el permiso).
//   accounts → cuentas del banco (identificador opaco y pista), para vincularlas a las de la persona.
import { toHex } from "./bytes.ts";
import {
  authHeaders,
  buildAuthBody,
  parseAuthResponse,
  parseBanks,
  parseSession,
  signApplicationJwt,
} from "./enable-banking.ts";
import { json, serviceRpc, userRpc, type Fetch, type RpcConfig } from "./rpc.ts";
import { readBundle, writeBundle } from "./secret-bundle.ts";
import { safeEqual } from "./update-prices.ts";
import { VaultError, type Kek } from "./vault.ts";

export interface ConnectBankConfig extends RpcConfig {
  readonly publishableKey: string;
  readonly applicationId: string;
  readonly privateKeyPem: string;
  /** Dirección registrada en Enable Banking a la que vuelve la persona (fija: no la elige quien llama). */
  readonly redirectUrl: string;
  readonly apiBase: string;
}

export interface ConnectBankDeps {
  readonly fetchFn: Fetch;
  readonly now: () => Date;
  readonly keks: { readonly current: Kek; readonly byVersion: ReadonlyMap<number, Kek> };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[A-Za-z0-9._~-]{1,2000}$/;
const STATE = /^[0-9a-f-]{36}\.[0-9a-f]{32}$/;
const MAX_BODY_BYTES = 4096;
const STATE_MINUTES = 10;

interface ConnectionInfo {
  readonly space_id: string;
  readonly provider: string;
  readonly status: string;
}

async function providerCall(
  config: ConnectBankConfig,
  deps: ConnectBankDeps,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; data: unknown }> {
  try {
    const jwt = await signApplicationJwt(
      config.applicationId,
      config.privateKeyPem,
      Math.floor(deps.now().getTime() / 1000),
    );
    const response = await deps.fetchFn(`${config.apiBase}${path}`, {
      method,
      headers: { ...authHeaders(jwt), ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    return { ok: response.ok, data: await response.json().catch(() => null) };
  } catch {
    return { ok: false, data: null };
  }
}

export async function handleConnectBank(
  request: Request,
  config: ConnectBankConfig,
  deps: ConnectBankDeps,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const jwt = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!jwt) return json(401, { error: "unauthorized" });
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return json(413, { error: "too_large" });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large" });
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_body" });
  }
  const action = body.action;
  const publishableKey = request.headers.get("apikey") ?? config.publishableKey;

  if (action === "banks") {
    const country = body.country;
    if (typeof country !== "string" || !/^[A-Z]{2}$/.test(country)) return json(400, { error: "invalid_body" });
    // Cualquier persona con sesión válida puede ver la lista; se comprueba el JWT con Supabase.
    const who = await deps.fetchFn(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!who?.ok) return json(403, { error: "forbidden" });
    const banks = await providerCall(config, deps, "GET", `/aspsps?country=${country}`);
    if (!banks.ok) return json(502, { error: "provider_failed" });
    return json(200, { banks: parseBanks(banks.data) });
  }

  const connectionId = body.connection_id;
  if (
    (action !== "start" && action !== "finish" && action !== "accounts") ||
    typeof connectionId !== "string" ||
    !UUID.test(connectionId)
  ) {
    return json(400, { error: "invalid_body" });
  }
  const allowed = await userRpc<boolean>({ ...config, publishableKey }, deps.fetchFn, jwt, "can_manage_connection", {
    p_connection_id: connectionId,
  });
  if (!allowed.ok || allowed.data !== true) return json(403, { error: "forbidden" });
  const info = await serviceRpc<ConnectionInfo[]>(config, deps.fetchFn, "get_connection_info", {
    p_connection_id: connectionId,
  });
  const connection = info.data?.[0];
  if (!connection || connection.provider !== "enable_banking") return json(404, { error: "not_found" });
  const scope = { spaceId: connection.space_id, connectionId };

  let stored: Awaited<ReturnType<typeof readBundle>> = null;
  if (action !== "start") {
    try {
      stored = await readBundle(config, deps.fetchFn, connectionId, deps.keks.byVersion);
    } catch (error) {
      if (error instanceof VaultError) return json(409, { error: "secret_unreadable" });
      throw error;
    }
    if (!stored) return json(409, { error: "no_session" });
    if (action === "accounts") {
      const accounts = stored.bundle.accounts;
      return json(200, { accounts: Array.isArray(accounts) ? accounts : [] });
    }
  }
  if (connection.status !== "pending") return json(409, { error: "not_pending" });

  if (action === "start") {
    const bankName = body.bank_name;
    const country = body.country;
    if (
      typeof bankName !== "string" ||
      bankName.length < 1 ||
      bankName.length > 100 ||
      typeof country !== "string" ||
      !/^[A-Z]{2}$/.test(country)
    ) {
      return json(400, { error: "invalid_body" });
    }
    const state = `${connectionId}.${toHex(crypto.getRandomValues(new Uint8Array(16)))}`;
    const now = deps.now();
    const saved = await writeBundle(
      config,
      deps.fetchFn,
      scope,
      {
        state,
        stateExpiresAt: new Date(now.getTime() + STATE_MINUTES * 60_000).toISOString(),
        bank: { name: bankName, country },
      },
      deps.keks.current,
      null,
    );
    if (!saved) return json(502, { error: "store_failed" });
    const auth = await providerCall(
      config,
      deps,
      "POST",
      "/auth",
      buildAuthBody(
        { bankName, country, state, redirectUrl: config.redirectUrl, validUntil: new Date(now.getTime() + 180 * 86_400_000) },
        now,
      ),
    );
    const parsed = auth.ok ? parseAuthResponse(auth.data) : null;
    if (!parsed) return json(502, { error: "provider_failed" });
    return json(200, { url: parsed.url });
  }

  // finish
  const { state, code } = body;
  if (typeof state !== "string" || !STATE.test(state) || typeof code !== "string" || !CODE.test(code)) {
    return json(400, { error: "invalid_body" });
  }
  const expected = stored?.bundle.state;
  const expires = stored?.bundle.stateExpiresAt;
  if (typeof expected !== "string" || !(await safeEqual(state, expected))) {
    return json(409, { error: "state_mismatch" });
  }
  if (typeof expires !== "string" || Date.parse(expires) < deps.now().getTime()) {
    return json(409, { error: "state_expired" });
  }
  const created = await providerCall(config, deps, "POST", "/sessions", { code });
  const session = created.ok ? parseSession(created.data) : null;
  if (!session) return json(502, { error: "provider_failed" });
  const until = session.validUntil ?? new Date(deps.now().getTime() + 180 * 86_400_000).toISOString();
  const saved = await writeBundle(
    config,
    deps.fetchFn,
    scope,
    { sessionId: session.sessionId, accounts: session.accounts, validUntil: until },
    deps.keks.current,
    null,
  );
  if (!saved) return json(502, { error: "store_failed" });
  const activated = await serviceRpc<unknown>(config, deps.fetchFn, "activate_connection", {
    p_connection_id: connectionId,
    p_consent_expires_at: until,
  });
  if (!activated.ok) return json(502, { error: "activate_failed" });
  return json(200, { accounts: session.accounts, validUntil: until });
}

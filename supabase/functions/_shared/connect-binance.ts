// Conexión de Binance en dos pasos. La persona solo registra en Binance la clave PÚBLICA que
// genera el servidor; la privada se cifra en la bóveda y no vuelve a salir.
//   start  → genera el par Ed25519, guarda la privada cifrada y devuelve la pública (PEM).
//   finish → recibe la clave de acceso (API key) de Binance, comprueba que es de SOLO LECTURA y
//            activa la conexión. Si la clave puede operar o retirar, se rechaza y se revoca.
import { fromBase64, toBase64 } from "./bytes.ts";
import {
  auditApiRestrictions,
  authHeaders,
  generateKeypair,
  publicKeyFingerprint,
  signedUrl,
} from "./binance.ts";
import { json, serviceRpc, userRpc, type Fetch, type RpcConfig } from "./rpc.ts";
import { readBundle, writeBundle } from "./secret-bundle.ts";
import { VaultError, type Kek } from "./vault.ts";

export interface ConnectConfig extends RpcConfig {
  readonly publishableKey: string;
  readonly binanceBase: string;
}

export interface ConnectDeps {
  readonly fetchFn: Fetch;
  readonly now: () => Date;
  readonly keks: { readonly current: Kek; readonly byVersion: ReadonlyMap<number, Kek> };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Las claves de acceso de Binance son alfanuméricas (64 caracteres); se admite un margen.
const API_KEY = /^[A-Za-z0-9]{32,128}$/;
const MAX_BODY_BYTES = 4096;

interface ConnectionInfo {
  readonly space_id: string;
  readonly provider: string;
  readonly status: string;
}

export async function handleConnectBinance(
  request: Request,
  config: ConnectConfig,
  deps: ConnectDeps,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const jwt = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!jwt) return json(401, { error: "unauthorized" });

  // Primero la cabecera (no se lee un cuerpo enorme) y después el texto leído, por si no la trae.
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
  const { action, connection_id: connectionId, api_key: apiKey } = body;
  if ((action !== "start" && action !== "finish") || typeof connectionId !== "string" || !UUID.test(connectionId)) {
    return json(400, { error: "invalid_body" });
  }

  // Con el JWT de la persona (RLS): ¿puede gestionar esta conexión, con el segundo factor al día?
  const publishableKey = request.headers.get("apikey") ?? config.publishableKey;
  const allowed = await userRpc<boolean>({ ...config, publishableKey }, deps.fetchFn, jwt, "can_manage_connection", {
    p_connection_id: connectionId,
  });
  if (!allowed.ok || allowed.data !== true) return json(403, { error: "forbidden" });

  const info = await serviceRpc<ConnectionInfo[]>(config, deps.fetchFn, "get_connection_info", {
    p_connection_id: connectionId,
  });
  const connection = info.data?.[0];
  if (!connection || connection.provider !== "binance") return json(404, { error: "not_found" });
  if (connection.status !== "pending") return json(409, { error: "not_pending" });
  const scope = { spaceId: connection.space_id, connectionId };

  if (action === "start") {
    const pair = await generateKeypair();
    try {
      const stored = await writeBundle(
        config,
        deps.fetchFn,
        scope,
        { privateKey: toBase64(pair.privateKeyPkcs8) },
        deps.keks.current,
        await publicKeyFingerprint(pair.publicKeyPem),
      );
      if (!stored) return json(502, { error: "store_failed" });
      return json(200, {
        publicKeyPem: pair.publicKeyPem,
        fingerprint: await publicKeyFingerprint(pair.publicKeyPem),
      });
    } finally {
      pair.privateKeyPkcs8.fill(0);
    }
  }

  // finish
  if (typeof apiKey !== "string" || !API_KEY.test(apiKey)) return json(400, { error: "invalid_api_key" });
  let stored: Awaited<ReturnType<typeof readBundle>>;
  try {
    stored = await readBundle(config, deps.fetchFn, connectionId, deps.keks.byVersion);
  } catch (error) {
    if (error instanceof VaultError) return json(409, { error: "secret_unreadable" });
    throw error;
  }
  const privateKeyText = stored?.bundle.privateKey;
  if (typeof privateKeyText !== "string") return json(409, { error: "no_key_pair" });
  const privateKey = fromBase64(privateKeyText);
  try {
    let response: Response;
    try {
      response = await deps.fetchFn(
        await signedUrl(config.binanceBase, "/sapi/v1/account/apiRestrictions", {}, privateKey, deps.now().getTime()),
        { headers: authHeaders(apiKey), signal: AbortSignal.timeout(15_000) },
      );
    } catch {
      return json(502, { error: "provider_unreachable" });
    }
    if (!response.ok) return json(400, { error: "key_rejected" });
    const audit = auditApiRestrictions(await response.json().catch(() => null));
    if (!audit.readOnly) {
      // Una clave con permisos de más no se conserva: se revoca la conexión y se borra el secreto.
      await serviceRpc<unknown>(config, deps.fetchFn, "revoke_connection", { p_connection_id: connectionId });
      return json(422, { error: "key_not_readonly", violations: audit.violations });
    }
    const saved = await writeBundle(
      config,
      deps.fetchFn,
      scope,
      { privateKey: privateKeyText, apiKey },
      deps.keks.current,
      null,
    );
    if (!saved) return json(502, { error: "store_failed" });
    const activated = await serviceRpc<unknown>(config, deps.fetchFn, "activate_connection", {
      p_connection_id: connectionId,
    });
    if (!activated.ok) return json(502, { error: "activate_failed" });
    return json(200, { ok: true, ipRestricted: audit.ipRestricted });
  } finally {
    privateKey.fill(0);
  }
}

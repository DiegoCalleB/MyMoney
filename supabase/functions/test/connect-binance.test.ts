import { describe, expect, it } from "vitest";
import { toBase64, toHex } from "../_shared/bytes.ts";
import { handleConnectBinance, type ConnectConfig } from "../_shared/connect-binance.ts";
import { importKek } from "../_shared/vault.ts";
import {
  CONNECTION_ID,
  SERVICE_KEY,
  SPACE_ID,
  fakeFetch,
  reply,
  testKeks,
  vaultRoutes,
  type Handler,
} from "./fakes.ts";

const config: ConnectConfig = {
  supabaseUrl: "https://proyecto.example.test",
  serviceKey: SERVICE_KEY,
  publishableKey: "clave-publicable-de-prueba",
  binanceBase: "https://binance.example.test",
};
const NOW = new Date("2026-10-28T10:00:00Z");
const API_KEY = "A".repeat(64);
const READ_ONLY = {
  ipRestrict: true,
  enableReading: true,
  enableWithdrawals: false,
  enableInternalTransfer: false,
  permitsUniversalTransfer: false,
  enableMargin: false,
  enableFutures: false,
  enableVanillaOptions: false,
  enableSpotAndMarginTrading: false,
};

const request = (body: unknown, headers: Record<string, string> = { authorization: "Bearer jwt-de-prueba" }, method = "POST") =>
  new Request("https://f.example.test/connect-binance", {
    method,
    headers,
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });

async function setup(extra: Record<string, Handler> = {}, status = "pending", provider = "binance") {
  const vault = vaultRoutes();
  const fake = fakeFetch({
    "rpc:can_manage_connection": () => reply(200, true),
    "rpc:get_connection_info": () => reply(200, [{ space_id: SPACE_ID, provider, status }]),
    "rpc:revoke_connection": () => reply(200, null),
    "rpc:activate_connection": () => reply(200, null),
    ...vault.routes,
    ...extra,
  });
  return { ...fake, vault, deps: { fetchFn: fake.fetchFn, now: () => NOW, keks: await testKeks() } };
}

describe("handleConnectBinance: entrada", () => {
  it("solo POST, con JWT y cuerpo válido", async () => {
    const { deps, calls } = await setup();
    const run = (req: Request) => handleConnectBinance(req, config, deps);
    expect((await run(request({}, undefined, "GET"))).status).toBe(405);
    expect((await run(request({ action: "start", connection_id: CONNECTION_ID }, {}))).status).toBe(401);
    expect((await run(request("x".repeat(5000)))).status).toBe(413);
    expect((await run(request("no es json"))).status).toBe(400);
    expect((await run(request("[]"))).status).toBe(400);
    expect((await run(request({ action: "otra", connection_id: CONNECTION_ID }))).status).toBe(400);
    expect((await run(request({ action: "start", connection_id: "no-uuid" }))).status).toBe(400);
    expect((await run(request({ action: "start" }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("sin permiso (o con el segundo factor sin verificar) no se toca nada del servidor", async () => {
    const denied = await setup({ "rpc:can_manage_connection": () => reply(200, false) });
    const res = await handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, denied.deps);
    expect(res.status).toBe(403);
    expect(denied.calls.map((c) => c.name)).toEqual(["rpc:can_manage_connection"]);
    // La comprobación va con el JWT de la persona, no con la clave del servidor.
    expect(denied.calls[0]?.headers.authorization).toBe("Bearer jwt-de-prueba");
    expect(denied.calls[0]?.headers.apikey).toBe("clave-publicable-de-prueba");

    const failing = await setup({ "rpc:can_manage_connection": () => reply(401, null) });
    expect((await handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, failing.deps)).status).toBe(403);
  });

  it("usa la clave publicable que envía la web si viene en la cabecera", async () => {
    const { deps, calls } = await setup({ "rpc:can_manage_connection": () => reply(200, false) });
    await handleConnectBinance(
      request(
        { action: "start", connection_id: CONNECTION_ID },
        { authorization: "Bearer jwt-de-prueba", apikey: "publicable-de-la-web" },
      ),
      config,
      deps,
    );
    expect(calls[0]?.headers.apikey).toBe("publicable-de-la-web");
  });

  it("la conexión debe existir, ser de Binance y estar pendiente", async () => {
    const other = await setup({}, "pending", "etoro");
    expect((await handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, other.deps)).status).toBe(404);
    const missing = await setup({ "rpc:get_connection_info": () => reply(200, []) });
    expect((await handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, missing.deps)).status).toBe(404);
    const active = await setup({}, "active");
    expect((await handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, active.deps)).status).toBe(409);
  });
});

describe("handleConnectBinance: start", () => {
  it("genera el par, guarda la privada cifrada y devuelve solo la pública", async () => {
    const { deps, vault, named } = await setup();
    const res = await handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { publicKeyPem: string; fingerprint: string };
    expect(body.publicKeyPem).toContain("BEGIN PUBLIC KEY");
    expect(body.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toContain("PRIVATE");
    const put = named("rpc:put_connection_secret")[0];
    expect(put?.headers.authorization).toBe(`Bearer ${SERVICE_KEY}`);
    expect(put?.body.p_public_hint).toBe(body.fingerprint);
    expect(put?.body.p_kek_version).toBe(1);
    expect(String(put?.body.p_ciphertext)).toMatch(/^\\x[0-9a-f]+$/);
    expect(vault.state.row).not.toBeNull();
  });

  it("si no se puede guardar el secreto, falla sin devolver la clave", async () => {
    const { deps } = await setup({ "rpc:put_connection_secret": () => reply(500, null) });
    const res = await handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "store_failed" });
  });
});

describe("handleConnectBinance: finish", () => {
  const finish = (key: unknown = API_KEY) => request({ action: "finish", connection_id: CONNECTION_ID, api_key: key });
  const start = (deps: Awaited<ReturnType<typeof setup>>["deps"]) =>
    handleConnectBinance(request({ action: "start", connection_id: CONNECTION_ID }), config, deps);

  it("con una clave de solo lectura activa la conexión y vuelve a guardar el secreto con la clave de acceso", async () => {
    const t = await setup({ "apiRestrictions": () => reply(200, READ_ONLY) });
    await start(t.deps);
    const res = await handleConnectBinance(finish(), config, t.deps);
    expect(await res.json()).toEqual({ ok: true, ipRestricted: true });
    expect(t.named("rpc:put_connection_secret")).toHaveLength(2);
    expect(t.named("rpc:activate_connection")).toHaveLength(1);
    const call = t.calls.find((c) => c.url.includes("apiRestrictions"));
    expect(call?.headers["X-MBX-APIKEY"]).toBe(API_KEY);
    expect(call?.url).toContain("signature=");
    // El secreto guardado no contiene la clave de acceso en claro.
    const stored = String(t.named("rpc:put_connection_secret")[1]?.body.p_ciphertext);
    expect(stored).not.toContain(toHex(new TextEncoder().encode(API_KEY)));
  });

  it("rechaza una clave con permisos de más, la revoca y no la guarda", async () => {
    const t = await setup({ apiRestrictions: () => reply(200, { ...READ_ONLY, enableWithdrawals: true }) });
    await start(t.deps);
    const res = await handleConnectBinance(finish(), config, t.deps);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "key_not_readonly", violations: ["enableWithdrawals"] });
    expect(t.named("rpc:revoke_connection")).toHaveLength(1);
    expect(t.named("rpc:put_connection_secret")).toHaveLength(1);
    expect(t.named("rpc:activate_connection")).toHaveLength(0);
  });

  it("una respuesta ilegible del proveedor también se rechaza", async () => {
    const t = await setup({ apiRestrictions: () => new Response("no json", { status: 200 }) });
    await start(t.deps);
    expect((await handleConnectBinance(finish(), config, t.deps)).status).toBe(422);
  });

  it("valida el formato de la clave de acceso antes de hacer nada", async () => {
    const t = await setup();
    await start(t.deps);
    const before = t.calls.length;
    for (const key of [null, 5, "", "corta", "a".repeat(200), `${"A".repeat(63)}!`]) {
      expect((await handleConnectBinance(finish(key), config, t.deps)).status).toBe(400);
    }
    expect(t.calls.length - before).toBe(6 * 2); // solo permiso + ficha por intento
  });

  it("sin par de claves previo (no se hizo el primer paso) no continúa", async () => {
    const t = await setup();
    const res = await handleConnectBinance(finish(), config, t.deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_key_pair" });
    const noKey = await setup({ "rpc:get_connection_secret": () => reply(200, []) });
    expect((await handleConnectBinance(finish(), config, noKey.deps)).status).toBe(409);
  });

  it("un secreto que no se puede abrir (otra clave maestra) no continúa; un fallo de red se propaga", async () => {
    const t = await setup({ apiRestrictions: () => reply(200, READ_ONLY) });
    await start(t.deps);
    const wrong = { current: await importKek(toBase64(new Uint8Array(32).fill(9)), 1), byVersion: new Map() };
    const bad = { ...t.deps, keks: { ...wrong, byVersion: new Map([[1, wrong.current]]) } };
    const res = await handleConnectBinance(finish(), config, bad);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "secret_unreadable" });

    const down = await setup({
      "rpc:get_connection_secret": () => {
        throw new Error("sin red");
      },
    });
    await expect(handleConnectBinance(finish(), config, down.deps)).rejects.toThrow("sin red");
  });

  it("errores del proveedor y de la base de datos", async () => {
    const rejected = await setup({ apiRestrictions: () => reply(401, { code: -2015 }) });
    await start(rejected.deps);
    const r1 = await handleConnectBinance(finish(), config, rejected.deps);
    expect(r1.status).toBe(400);
    expect(await r1.json()).toEqual({ error: "key_rejected" });

    const unreachable = await setup({
      apiRestrictions: () => {
        throw new Error("sin red");
      },
    });
    await start(unreachable.deps);
    expect((await handleConnectBinance(finish(), config, unreachable.deps)).status).toBe(502);

    const vault = vaultRoutes();
    let puts = 0;
    const storeFails = await setup({
      apiRestrictions: () => reply(200, READ_ONLY),
      "rpc:put_connection_secret": (call) => {
        puts += 1;
        return puts === 1 ? (vault.routes["rpc:put_connection_secret"] as Handler)(call) : reply(500, null);
      },
      "rpc:get_connection_secret": (call) => (vault.routes["rpc:get_connection_secret"] as Handler)(call),
    });
    await start(storeFails.deps);
    const r3 = await handleConnectBinance(finish(), config, storeFails.deps);
    expect(await r3.json()).toEqual({ error: "store_failed" });

    const activateFails = await setup({
      apiRestrictions: () => reply(200, READ_ONLY),
      "rpc:activate_connection": () => reply(500, null),
    });
    await start(activateFails.deps);
    const r4 = await handleConnectBinance(finish(), config, activateFails.deps);
    expect(await r4.json()).toEqual({ error: "activate_failed" });
  });
});

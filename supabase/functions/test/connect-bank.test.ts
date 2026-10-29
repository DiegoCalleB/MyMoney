import { describe, expect, it } from "vitest";
import { toBase64 } from "../_shared/bytes.ts";
import { handleConnectBank, type ConnectBankConfig } from "../_shared/connect-bank.ts";
import { importKek } from "../_shared/vault.ts";
import { CONNECTION_ID, SERVICE_KEY, SPACE_ID, fakeFetch, reply, testKeks, vaultRoutes, type Handler } from "./fakes.ts";

async function config(): Promise<ConnectBankConfig> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return {
    supabaseUrl: "https://proyecto.example.test",
    serviceKey: SERVICE_KEY,
    publishableKey: "publicable-de-prueba",
    applicationId: "app-123",
    privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${toBase64(der)}\n-----END PRIVATE KEY-----`,
    redirectUrl: "https://app.example.test/conexiones/retorno",
    apiBase: "https://eb.example.test",
  };
}
const NOW = new Date("2026-10-29T10:00:00Z");
const SESSION = {
  session_id: "sess-1",
  access: { valid_until: "2027-04-01T00:00:00Z" },
  accounts: [{ uid: "uid-1", account_id: { iban: "ES9121000418450200051332" }, currency: "EUR" }],
};

const req = (body: unknown, headers: Record<string, string> = { authorization: "Bearer jwt-de-prueba" }, method = "POST") =>
  new Request("https://f.example.test/connect-bank", {
    method,
    headers,
    ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });

async function setup(extra: Record<string, Handler> = {}, status = "pending", provider = "enable_banking") {
  const vault = vaultRoutes();
  const fake = fakeFetch({
    "auth/v1/user": () => reply(200, { id: "u" }),
    "rpc:can_manage_connection": () => reply(200, true),
    "rpc:get_connection_info": () => reply(200, [{ space_id: SPACE_ID, provider, status }]),
    "rpc:activate_connection": () => reply(200, null),
    ...vault.routes,
    "eb.example.test/aspsps": () => reply(200, { aspsps: [{ name: "Banco Ficticio", country: "ES" }] }),
    "eb.example.test/auth": () => reply(200, { url: "https://banco.example.test/permiso", authorization_id: "a" }),
    "eb.example.test/sessions": () => reply(200, SESSION),
    ...extra,
  });
  const cfg = await config();
  return { ...fake, cfg, vault, deps: { fetchFn: fake.fetchFn, now: () => NOW, keks: await testKeks() } };
}
type T = Awaited<ReturnType<typeof setup>>;
const run = (t: T, body: unknown, headers?: Record<string, string>) => handleConnectBank(req(body, headers), t.cfg, t.deps);
const start = (t: T) => run(t, { action: "start", connection_id: CONNECTION_ID, bank_name: "Banco Ficticio", country: "ES" });
const stateOf = (t: T) => (JSON.parse(JSON.stringify(t.named("eb.example.test/auth"))) as never, (t.calls.find((c) => c.url.endsWith("/auth"))?.body.state as string));

describe("handleConnectBank: entrada", () => {
  it("solo POST, con JWT y cuerpo válido", async () => {
    const t = await setup();
    expect((await handleConnectBank(req({}, undefined, "GET"), t.cfg, t.deps)).status).toBe(405);
    expect((await run(t, {}, {})).status).toBe(401);
    expect((await run(t, "x".repeat(5000))).status).toBe(413);
    expect((await run(t, {}, { authorization: "Bearer j", "content-length": "99999" })).status).toBe(413);
    expect((await run(t, "no json")).status).toBe(400);
    expect((await run(t, "[]")).status).toBe(400);
    expect((await run(t, { action: "otra", connection_id: CONNECTION_ID })).status).toBe(400);
    expect((await run(t, { action: "start", connection_id: "no-uuid" })).status).toBe(400);
    expect(t.calls).toHaveLength(0);
  });

  it("sin permiso o con una conexión que no es de este tipo no hay efectos", async () => {
    const denied = await setup({ "rpc:can_manage_connection": () => reply(200, false) });
    expect((await start(denied)).status).toBe(403);
    expect(denied.calls.map((c) => c.name)).toEqual(["rpc:can_manage_connection"]);
    const wrong = await setup({}, "pending", "binance");
    expect((await start(wrong)).status).toBe(404);
    const missing = await setup({ "rpc:get_connection_info": () => reply(200, []) });
    expect((await start(missing)).status).toBe(404);
    const active = await setup({}, "active");
    expect((await start(active)).status).toBe(409);
  });
});

describe("handleConnectBank: bancos", () => {
  it("lista los bancos de un país con una sesión válida", async () => {
    const t = await setup();
    const res = await run(t, { action: "banks", country: "ES" });
    expect(await res.json()).toEqual({ banks: [{ name: "Banco Ficticio", country: "ES" }] });
    const provider = t.calls.find((c) => c.url.includes("eb.example.test"));
    expect(provider?.headers.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(provider?.url).toContain("country=ES");
  });

  it("rechaza país inválido, sesión inválida y fallo del proveedor", async () => {
    const t = await setup();
    expect((await run(t, { action: "banks", country: "españa" })).status).toBe(400);
    const noSession = await setup({ "auth/v1/user": () => reply(401, {}) });
    expect((await run(noSession, { action: "banks", country: "ES" })).status).toBe(403);
    const down = await setup({ "auth/v1/user": () => { throw new Error("sin red"); } });
    expect((await run(down, { action: "banks", country: "ES" })).status).toBe(403);
    const failing = await setup({ "eb.example.test/aspsps": () => reply(500, {}) });
    expect((await run(failing, { action: "banks", country: "ES" })).status).toBe(502);
    const notJson = await setup({ "eb.example.test/aspsps": () => new Response("no es json", { status: 200 }) });
    expect(await (await run(notJson, { action: "banks", country: "ES" })).json()).toEqual({ banks: [] });
    const net = await setup({ "eb.example.test/aspsps": () => { throw new Error("sin red"); } });
    expect((await run(net, { action: "banks", country: "ES" })).status).toBe(502);
  });
});

describe("handleConnectBank: start", () => {
  it("guarda el state cifrado y devuelve la dirección del banco", async () => {
    const t = await setup();
    const res = await start(t);
    expect(await res.json()).toEqual({ url: "https://banco.example.test/permiso" });
    const auth = t.calls.find((c) => c.url.endsWith("/auth"));
    expect(auth?.body).toMatchObject({
      aspsp: { name: "Banco Ficticio", country: "ES" },
      redirect_url: "https://app.example.test/conexiones/retorno",
      psu_type: "personal",
    });
    expect(String(auth?.body.state)).toMatch(new RegExp(`^${CONNECTION_ID}\\.[0-9a-f]{32}$`));
    expect(t.named("rpc:put_connection_secret")).toHaveLength(1);
    // El state no viaja en claro a la base de datos.
    expect(JSON.stringify(t.named("rpc:put_connection_secret")[0]?.body)).not.toContain(String(auth?.body.state));
  });

  it("valida el banco y el país, y falla limpio si el proveedor o la bóveda fallan", async () => {
    const t = await setup();
    for (const extra of [{}, { bank_name: "" }, { bank_name: "x".repeat(101) }, { bank_name: "B", country: "es" }]) {
      const res = await run(t, { action: "start", connection_id: CONNECTION_ID, country: "ES", ...extra });
      expect(res.status).toBe(400);
    }
    const providerFails = await setup({ "eb.example.test/auth": () => reply(400, {}) });
    expect((await start(providerFails)).status).toBe(502);
    const badUrl = await setup({ "eb.example.test/auth": () => reply(200, { url: "http://inseguro" }) });
    expect((await start(badUrl)).status).toBe(502);
    const storeFails = await setup({ "rpc:put_connection_secret": () => reply(500, null) });
    const res = await start(storeFails);
    expect(await res.json()).toEqual({ error: "store_failed" });
    expect(storeFails.calls.some((c) => c.url.includes("eb.example.test"))).toBe(false);
  });
});

describe("handleConnectBank: finish y accounts", () => {
  const finish = (t: T, state: string, code = "codigo-del-banco") =>
    run(t, { action: "finish", connection_id: CONNECTION_ID, state, code });

  it("con el state correcto abre la sesión, guarda el identificador cifrado y activa la conexión", async () => {
    const t = await setup();
    await start(t);
    const res = await finish(t, stateOf(t));
    expect(await res.json()).toEqual({
      accounts: [{ uid: "uid-1", hint: "••••1332", currency: "EUR" }],
      validUntil: "2027-04-01T00:00:00Z",
    });
    expect(t.calls.find((c) => c.url.endsWith("/sessions"))?.body).toEqual({ code: "codigo-del-banco" });
    expect(t.named("rpc:activate_connection")[0]?.body.p_consent_expires_at).toBe("2027-04-01T00:00:00Z");
    expect(JSON.stringify(t.calls)).not.toContain("ES9121000418450200051332");
    expect(JSON.stringify(t.named("rpc:put_connection_secret"))).not.toContain("sess-1");
  });

  it("sin fecha de caducidad en la sesión se usa el máximo de 180 días", async () => {
    const t = await setup({ "eb.example.test/sessions": () => reply(200, { session_id: "s", accounts: [] }) });
    await start(t);
    await finish(t, stateOf(t));
    expect(t.named("rpc:activate_connection")[0]?.body.p_consent_expires_at).toBe(new Date(NOW.getTime() + 180 * 86_400_000).toISOString());
  });

  it("rechaza un state distinto, caducado o mal formado, y no toca al proveedor", async () => {
    const t = await setup();
    await start(t);
    const state = stateOf(t);
    const other = `${CONNECTION_ID}.${"0".repeat(32)}`;
    expect(((await (await finish(t, other)).json()) as { error: string }).error).toBe("state_mismatch");
    expect((await finish(t, "basura")).status).toBe(400);
    expect((await finish(t, state, "código con espacios")).status).toBe(400);
    const late = { ...t.deps, now: () => new Date(NOW.getTime() + 11 * 60_000) };
    const res = await handleConnectBank(req({ action: "finish", connection_id: CONNECTION_ID, state, code: "c" }), t.cfg, late);
    expect(((await res.json()) as { error: string }).error).toBe("state_expired");
    expect(t.calls.some((c) => c.url.endsWith("/sessions"))).toBe(false);
  });

  it("falla limpio sin start previo, con otra clave maestra o con errores del proveedor y la base de datos", async () => {
    const none = await setup();
    expect((await finish(none, `${CONNECTION_ID}.${"a".repeat(32)}`)).status).toBe(409);
    const t = await setup();
    await start(t);
    const state = stateOf(t);
    const other = await importKek(toBase64(new Uint8Array(32).fill(9)), 1);
    const wrong = { ...t.deps, keks: { current: other, byVersion: new Map([[1, other]]) } };
    const unreadable = await handleConnectBank(req({ action: "finish", connection_id: CONNECTION_ID, state, code: "c" }), t.cfg, wrong);
    expect(((await unreadable.json()) as { error: string }).error).toBe("secret_unreadable");
    const down = await setup({ "rpc:get_connection_secret": () => { throw new Error("sin red"); } });
    await expect(finish(down, state)).rejects.toThrow("sin red");

    const stateFor = async (extra: Record<string, Handler>) => {
      const u = await setup(extra);
      await start(u);
      return { u, state: stateOf(u) };
    };
    const a = await stateFor({ "eb.example.test/sessions": () => reply(400, {}) });
    expect((await finish(a.u, a.state)).status).toBe(502);
    const b = await stateFor({ "eb.example.test/sessions": () => reply(200, { nada: true }) });
    expect((await finish(b.u, b.state)).status).toBe(502);
    let puts = 0;
    const vault = vaultRoutes();
    const c = await stateFor({
      "rpc:put_connection_secret": (call) => (++puts === 1 ? (vault.routes["rpc:put_connection_secret"] as Handler)(call) : reply(500, null)),
      "rpc:get_connection_secret": (call) => (vault.routes["rpc:get_connection_secret"] as Handler)(call),
    });
    expect(((await (await finish(c.u, c.state)).json()) as { error: string }).error).toBe("store_failed");
    const d = await stateFor({ "rpc:activate_connection": () => reply(500, null) });
    expect(((await (await finish(d.u, d.state)).json()) as { error: string }).error).toBe("activate_failed");
  });

  it("accounts devuelve las cuentas guardadas (sin IBAN) y lista vacía si aún no hay", async () => {
    const t = await setup();
    await start(t);
    await finish(t, stateOf(t));
    const res = await run(t, { action: "accounts", connection_id: CONNECTION_ID });
    expect(await res.json()).toEqual({ accounts: [{ uid: "uid-1", hint: "••••1332", currency: "EUR" }] });
    const pending = await setup();
    await start(pending);
    const empty = await run(pending, { action: "accounts", connection_id: CONNECTION_ID });
    expect(await empty.json()).toEqual({ accounts: [] });
    const none = await setup();
    const missing = await run(none, { action: "accounts", connection_id: CONNECTION_ID });
    expect(missing.status).toBe(409);
  });
});

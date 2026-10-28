import { describe, expect, it } from "vitest";
import { toBase64 } from "../_shared/bytes.ts";
import { handleSyncWorker, type SyncConfig } from "../_shared/sync-worker.ts";
import { writeBundle } from "../_shared/secret-bundle.ts";
import { importKek } from "../_shared/vault.ts";
import { CONNECTION_ID, SERVICE_KEY, SPACE_ID, fakeFetch, reply, testKeks, vaultRoutes, type Handler } from "./fakes.ts";

const NOW = new Date("2026-10-29T10:00:00Z");
const JOB = { job_id: 21, connection_id: CONNECTION_ID, provider: "enable_banking" };
const BALANCES = {
  balances: [{ balance_type: "CLBD", balance_amount: { currency: "EUR", amount: "1234.50" } }],
};
const TX = (key: string | null) => ({
  transactions: [
    {
      entry_reference: "r1",
      status: "BOOK",
      booking_date: "2026-10-20",
      credit_debit_indicator: "CRDT",
      transaction_amount: { currency: "EUR", amount: "1500.00" },
      remittance_information: ["Nómina"],
    },
  ],
  ...(key ? { continuation_key: key } : {}),
});

async function bankConfig(withBank = true): Promise<SyncConfig> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return {
    supabaseUrl: "https://proyecto.example.test",
    serviceKey: SERVICE_KEY,
    cronSecret: "secreto-de-prueba",
    binanceBase: "https://binance.example.test",
    bank: withBank
      ? {
          applicationId: "app-1",
          privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${toBase64(der)}\n-----END PRIVATE KEY-----`,
          apiBase: "https://eb.example.test",
        }
      : null,
    quote: "EUR",
    minorDigits: 2,
    maxJobs: 5,
  };
}

async function setup(
  overrides: Record<string, Handler> = {},
  opts: { withBank?: boolean; bundle?: Record<string, unknown> | null; linked?: string[] } = {},
) {
  const config = await bankConfig(opts.withBank ?? true);
  const keks = await testKeks();
  const vault = vaultRoutes();
  if (opts.bundle !== null) {
    await writeBundle(
      config,
      fakeFetch(vault.routes).fetchFn,
      { spaceId: SPACE_ID, connectionId: CONNECTION_ID },
      opts.bundle ?? {
        sessionId: "s",
        validUntil: "2027-04-01T00:00:00Z",
        accounts: [{ uid: "uid-1", hint: "••••1332", currency: "EUR" }, { uid: "uid-2", hint: "••••", currency: "" }, { uid: 7 }, "x"],
      },
      keks.current,
      null,
    );
  }
  const fake = fakeFetch({
    "rpc:claim_sync_jobs": () => reply(200, [JOB]),
    "rpc:take_rate_tokens": () => reply(200, 0),
    "rpc:finish_sync_job": () => reply(200, null),
    "rpc:get_connection_accounts": () =>
      reply(200, (opts.linked ?? ["uid-1", "uid-gone"]).map((external_ref) => ({ external_ref }))),
    "rpc:ingest_sync": () => reply(200, { new: 1 }),
    ...vault.routes,
    "/balances": () => reply(200, BALANCES),
    "/transactions": () => reply(200, TX(null)),
    ...overrides,
  });
  return { ...fake, config, deps: { fetchFn: fake.fetchFn, now: () => NOW, keks } };
}
type T = Awaited<ReturnType<typeof setup>>;
const run = (t: T) =>
  handleSyncWorker(
    new Request("https://f.example.test/", { method: "POST", headers: { "x-cron-secret": "secreto-de-prueba" } }),
    t.config,
    t.deps,
  );
const outcome = (t: T) => t.named("rpc:finish_sync_job").map((c) => [c.body.p_outcome, c.body.p_error_code]);

describe("sync-worker: Enable Banking", () => {
  it("lee saldo y movimientos solo de las cuentas vinculadas y los entrega a ingest_sync", async () => {
    const t = await setup();
    expect(await (await run(t)).json()).toEqual({ claimed: 1, done: 1, retried: 0, failed: 0 });
    const payload = t.named("rpc:ingest_sync")[0]?.body.p_payload as {
      flows: { id: string; kind: string }[];
      valuations: { external_ref: string; value_minor: string; as_of: string }[];
    };
    expect(payload.valuations).toEqual([
      { external_ref: "uid-1", as_of: "2026-10-29", value_minor: "123450", currency: "EUR" },
    ]);
    expect(payload.flows.map((f) => [f.id, f.kind])).toEqual([["tx:r1", "income"]]);
    const urls = t.calls.filter((c) => c.url.includes("eb.example.test")).map((c) => c.url);
    expect(urls.every((u) => u.includes("/accounts/uid-1/"))).toBe(true);
    expect(urls.some((u) => u.includes("date_from=2026-09-29&date_to=2026-10-29"))).toBe(true);
    expect(t.named("rpc:take_rate_tokens").map((c) => c.body.p_bucket)).toEqual([`eb:conn:${CONNECTION_ID}`, "eb:global"]);
  });

  it("sigue las páginas hasta 5 y usa la moneda del trabajo si la cuenta no la trae", async () => {
    let n = 0;
    const t = await setup(
      { "/transactions": () => reply(200, TX(`k${String(++n)}`)) },
      { linked: ["uid-2"] },
    );
    await run(t);
    expect(n).toBe(5);
    const keys = t.calls.filter((c) => c.url.includes("/transactions")).map((c) => c.url.includes("continuation_key"));
    expect(keys).toEqual([false, true, true, true, true]);
    const payload = t.named("rpc:ingest_sync")[0]?.body.p_payload as { valuations: { currency: string }[] };
    expect(payload.valuations[0]?.currency).toBe("EUR");
  });

  it("sin saldo utilizable no hay valoración, pero los movimientos se entregan", async () => {
    const t = await setup({ "/balances": () => reply(200, { balances: [] }) });
    await run(t);
    const payload = t.named("rpc:ingest_sync")[0]?.body.p_payload as { valuations: unknown[]; flows: unknown[] };
    expect(payload.valuations).toEqual([]);
    expect(payload.flows).toHaveLength(1);
  });

  it("falla limpio: sin configuración, sin secreto, consentimiento caducado o ilegible", async () => {
    const notConfigured = await setup({}, { withBank: false });
    await run(notConfigured);
    expect(outcome(notConfigured)).toEqual([["failed", "provider_not_configured"]]);
    const noSecret = await setup({}, { bundle: null });
    await run(noSecret);
    expect(outcome(noSecret)).toEqual([["failed", "no_secret"]]);
    const expired = await setup({}, { bundle: { validUntil: "2026-10-01T00:00:00Z", accounts: [] } });
    await run(expired);
    expect(outcome(expired)).toEqual([["failed", "consent_expired"]]);
    const unreadable = await setup();
    const key = await importKek(toBase64(new Uint8Array(32).fill(9)), 1);
    const other = { current: key, byVersion: new Map([[1, key]]) };
    await handleSyncWorker(
      new Request("https://f.example.test/", { method: "POST", headers: { "x-cron-secret": "secreto-de-prueba" } }),
      unreadable.config,
      { ...unreadable.deps, keks: other },
    );
    expect(outcome(unreadable)).toEqual([["failed", "secret_unreadable"]]);
  });

  it("tolera una sesión sin cuentas o con cuentas sin moneda, y reintenta si la bóveda no responde", async () => {
    const none = await setup({}, { bundle: { sessionId: "s" } });
    await run(none);
    expect(none.named("rpc:ingest_sync")[0]?.body.p_payload).toEqual({ flows: [], valuations: [] });
    const bare = await setup({}, { bundle: { accounts: [{ uid: "uid-1" }] } });
    await run(bare);
    expect(bare.named("rpc:ingest_sync")).toHaveLength(1);
    const down = await setup({ "rpc:get_connection_secret": () => { throw new Error("sin red"); } });
    await run(down);
    expect(outcome(down)).toEqual([["retry", "internal"]]);
  });

  it("clasifica los errores del banco y de la base de datos", async () => {
    const auth = await setup({ "/balances": () => reply(403, {}) });
    await run(auth);
    expect(outcome(auth)).toEqual([["failed", "auth_rejected"]]);
    const limited = await setup({ "/transactions": () => reply(429, {}, { "retry-after": "120" }) });
    await run(limited);
    expect(limited.named("rpc:finish_sync_job")[0]?.body).toMatchObject({ p_outcome: "retry", p_error_code: "rate_limited", p_retry_in_seconds: 120 });
    const tokens = await setup({ "rpc:take_rate_tokens": () => reply(200, 3600) });
    await run(tokens);
    expect(tokens.named("rpc:finish_sync_job")[0]?.body).toMatchObject({ p_outcome: "retry", p_error_code: "rate_limited", p_retry_in_seconds: 3600 });
    const accounts = await setup({ "rpc:get_connection_accounts": () => reply(500, null) });
    await run(accounts);
    expect(outcome(accounts)).toEqual([["retry", "internal"]]);
    const ingest = await setup({ "rpc:ingest_sync": () => reply(500, null) });
    await run(ingest);
    expect(outcome(ingest)).toEqual([["failed", "ingest_failed"]]);
  });
});

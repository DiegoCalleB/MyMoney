import { describe, expect, it } from "vitest";
import { toBase64 } from "../_shared/bytes.ts";
import { generateKeypair } from "../_shared/binance.ts";
import { JobFailure, handleSyncWorker, type SyncConfig } from "../_shared/sync-worker.ts";
import { writeBundle } from "../_shared/secret-bundle.ts";
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

const config: SyncConfig = {
  supabaseUrl: "https://proyecto.example.test",
  serviceKey: SERVICE_KEY,
  cronSecret: "secreto-de-prueba",
  binanceBase: "https://binance.example.test",
  bank: null,
  quote: "EUR",
  minorDigits: 2,
  maxJobs: 5,
};
const NOW = new Date("2026-10-28T10:00:00Z");
const API_KEY = "B".repeat(64);
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
const ACCOUNT = {
  balances: [
    { asset: "BTC", free: "0.01000000", locked: "0.00500000" },
    { asset: "EUR", free: "100.50", locked: "0.00" },
    { asset: "XYZ", free: "5", locked: "0" },
  ],
};
const FIAT_DEPOSITS = {
  data: [
    {
      orderNo: "D1",
      fiatCurrency: "EUR",
      indicatedAmount: "100.00",
      amount: "98.50",
      status: "Successful",
      createTime: Date.UTC(2026, 9, 1, 12),
    },
  ],
};
const FIAT_WITHDRAWALS = {
  data: [
    {
      orderNo: "W1",
      fiatCurrency: "EUR",
      indicatedAmount: "20.00",
      amount: "19.00",
      status: "Successful",
      createTime: Date.UTC(2026, 9, 2, 12),
    },
  ],
};

const post = (secret?: string) =>
  new Request("https://f.example.test/sync-worker", {
    method: "POST",
    ...(secret === undefined ? {} : { headers: { "x-cron-secret": secret } }),
  });
const JOB = { job_id: 11, connection_id: CONNECTION_ID, provider: "binance" };

/** Rutas completas de un Binance simulado y de la base de datos, con el secreto ya en la bóveda. */
async function setup(
  overrides: Record<string, Handler> = {},
  jobs: unknown[] = [JOB],
  bundle?: (privateKey: string) => Record<string, unknown>,
) {
  const keks = await testKeks();
  const vault = vaultRoutes();
  const pair = await generateKeypair();
  // El secreto se cifra con el mismo código de producción y se guarda en la bóveda simulada.
  const seedFetch = fakeFetch(vault.routes);
  await writeBundle(
    config,
    seedFetch.fetchFn,
    { spaceId: SPACE_ID, connectionId: CONNECTION_ID },
    bundle?.(toBase64(pair.privateKeyPkcs8)) ?? { privateKey: toBase64(pair.privateKeyPkcs8), apiKey: API_KEY },
    keks.current,
    null,
  );
  const fake = fakeFetch({
    "rpc:claim_sync_jobs": () => reply(200, jobs),
    "rpc:take_rate_tokens": () => reply(200, 0),
    "rpc:finish_sync_job": () => reply(200, null),
    "rpc:revoke_connection": () => reply(200, null),
    "rpc:ingest_sync": () => reply(200, { new: 2 }),
    ...vault.routes,
    apiRestrictions: () => reply(200, READ_ONLY),
    "api/v3/account": () => reply(200, ACCOUNT),
    "ticker/price": () => reply(200, [{ symbol: "BTCEUR", price: "60000.10" }]),
    "fiat/orders": (call) =>
      reply(200, call.url.includes("transactionType=0") ? FIAT_DEPOSITS : FIAT_WITHDRAWALS),
    ...overrides,
  });
  return { ...fake, deps: { fetchFn: fake.fetchFn, now: () => NOW, keks }, vault };
}

const run = async (t: Awaited<ReturnType<typeof setup>>, req = post("secreto-de-prueba")) =>
  handleSyncWorker(req, config, t.deps);
const finishes = (t: Awaited<ReturnType<typeof setup>>) =>
  t.named("rpc:finish_sync_job").map((c) => [c.body.p_outcome, c.body.p_error_code, c.body.p_retry_in_seconds]);

describe("handleSyncWorker: acceso", () => {
  it("solo POST y con el secreto compartido, sin tocar la base de datos", async () => {
    const t = await setup();
    expect((await run(t, new Request("https://f.example.test/"))).status).toBe(405);
    expect((await run(t, post())).status).toBe(401);
    expect((await run(t, post("otro"))).status).toBe(401);
    expect(
      (await handleSyncWorker(post(""), { ...config, cronSecret: "" }, t.deps)).status,
    ).toBe(401);
    expect(t.calls).toHaveLength(0);
  });

  it("si no puede reclamar trabajos, lo dice sin detalles", async () => {
    const t = await setup({ "rpc:claim_sync_jobs": () => reply(500, null) });
    const res = await run(t);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "claim_failed" });
    const notList = await setup({ "rpc:claim_sync_jobs": () => reply(200, { no: "lista" }) });
    expect((await run(notList)).status).toBe(502);
  });

  it("sin trabajos no hace nada más", async () => {
    const t = await setup({}, []);
    const res = await run(t);
    expect(await res.json()).toEqual({ claimed: 0, done: 0, retried: 0, failed: 0 });
    expect(t.calls).toHaveLength(1);
  });
});

describe("handleSyncWorker: sincronización de Binance", () => {
  it("lee saldos y movimientos, valora en euros y lo entrega a ingest_sync", async () => {
    const t = await setup();
    const res = await run(t);
    expect(await res.json()).toEqual({ claimed: 1, done: 1, retried: 0, failed: 0 });
    expect(finishes(t)).toEqual([["done", null, null]]);

    const ingest = t.named("rpc:ingest_sync")[0];
    expect(ingest?.headers.authorization).toBe(`Bearer ${SERVICE_KEY}`);
    expect(ingest?.body.p_connection_id).toBe(CONNECTION_ID);
    expect(ingest?.body.p_payload).toEqual({
      flows: [
        {
          external_ref: "spot",
          id: "deposit:D1",
          occurred_on: "2026-10-01",
          kind: "contribution",
          amount_minor: "9850",
          currency: "EUR",
          description: "Depósito en Binance",
        },
        {
          external_ref: "spot",
          id: "withdrawal:W1",
          occurred_on: "2026-10-02",
          kind: "withdrawal",
          amount_minor: "2000",
          currency: "EUR",
          description: "Retirada de Binance",
        },
      ],
      // 0,015 BTC × 60000,10 = 900,0015 → 900,00 €; + 100,50 € en euros. XYZ no tiene precio.
      valuations: [{ external_ref: "spot", as_of: "2026-10-28", value_minor: "100050", currency: "EUR" }],
    });
  });

  it("firma las peticiones con la clave de la bóveda y solo envía la clave pública de acceso", async () => {
    const t = await setup();
    await run(t);
    const signed = t.calls.filter((c) => c.url.includes("signature="));
    expect(signed.map((c) => new URL(c.url).pathname)).toEqual([
      "/sapi/v1/account/apiRestrictions",
      "/api/v3/account",
      "/sapi/v1/fiat/orders",
      "/sapi/v1/fiat/orders",
    ]);
    for (const call of signed) expect(call.headers["X-MBX-APIKEY"]).toBe(API_KEY);
    // El precio es público: ni clave ni firma.
    const ticker = t.calls.find((c) => c.url.includes("ticker/price"));
    expect(ticker?.headers["X-MBX-APIKEY"]).toBeUndefined();
    expect(ticker?.url).not.toContain("signature");
    // Nada de lo que se pide a Binance lleva el secreto del servidor.
    for (const call of t.calls.filter((c) => c.url.includes("binance.example.test"))) {
      expect(JSON.stringify(call.headers)).not.toContain(SERVICE_KEY);
    }
  });

  it("con solo euros no pide precios", async () => {
    const t = await setup({ "api/v3/account": () => reply(200, { balances: [{ asset: "EUR", free: "10", locked: "0" }] }) });
    await run(t);
    expect(t.calls.some((c) => c.url.includes("ticker/price"))).toBe(false);
    expect((t.named("rpc:ingest_sync")[0]?.body.p_payload as { valuations: { value_minor: string }[] }).valuations[0]?.value_minor).toBe("1000");
  });

  it("parte en varias peticiones de precios si hay más de 100 activos", async () => {
    const balances = Array.from({ length: 101 }, (_, i) => ({ asset: `T${String(i).padStart(3, "0")}`, free: "1", locked: "0" }));
    const t = await setup({ "api/v3/account": () => reply(200, { balances }), "ticker/price": () => reply(200, []) });
    await run(t);
    expect(t.calls.filter((c) => c.url.includes("ticker/price"))).toHaveLength(2);
  });
});

describe("handleSyncWorker: fallos", () => {
  it("el cubo de fichas agotado devuelve el trabajo a la cola con la espera, sin llamar a Binance", async () => {
    const t = await setup({ "rpc:take_rate_tokens": () => reply(200, 7) });
    const res = await run(t);
    expect(await res.json()).toEqual({ claimed: 1, done: 0, retried: 1, failed: 0 });
    expect(finishes(t)).toEqual([["retry", "rate_limited", 7]]);
    expect(t.calls.some((c) => c.url.includes("binance.example.test"))).toBe(false);
    const broken = await setup({ "rpc:take_rate_tokens": () => reply(500, null) });
    await run(broken);
    expect(finishes(broken)).toEqual([["retry", "internal", null]]);
  });

  it("una clave a la que se le han dado permisos de más se revoca", async () => {
    const t = await setup({ apiRestrictions: () => reply(200, { ...READ_ONLY, enableWithdrawals: true }) });
    const res = await run(t);
    expect(await res.json()).toEqual({ claimed: 1, done: 0, retried: 0, failed: 1 });
    expect(finishes(t)).toEqual([["failed", "key_not_readonly", null]]);
    expect(t.named("rpc:revoke_connection")[0]?.body.p_connection_id).toBe(CONNECTION_ID);
    expect(t.named("rpc:ingest_sync")).toHaveLength(0);
  });

  it.each([
    [401, undefined, "failed", "auth_rejected", null],
    [403, undefined, "failed", "auth_rejected", null],
    [429, "120", "retry", "rate_limited", 120],
    [418, "900", "retry", "rate_limited", 900],
    [429, undefined, "retry", "rate_limited", 300],
    [429, "99999", "retry", "rate_limited", 3600],
    [429, "no", "retry", "rate_limited", 300],
    [503, undefined, "retry", "provider_unavailable", null],
    [400, undefined, "failed", "bad_request", null],
  ])("Binance responde %s (Retry-After %s) → %s %s", async (status, retryAfter, outcome, code, wait) => {
    const headers = retryAfter ? { "retry-after": retryAfter } : {};
    const t = await setup({ "api/v3/account": () => reply(status, { code: -1 }, headers) });
    await run(t);
    expect(finishes(t)).toEqual([[outcome, code, wait]]);
    expect(t.named("rpc:revoke_connection")).toHaveLength(0);
  });

  it("un fallo de red o una respuesta ilegible se reintenta", async () => {
    const down = await setup({
      "api/v3/account": () => {
        throw new Error("sin red");
      },
    });
    await run(down);
    expect(finishes(down)).toEqual([["retry", "network", null]]);
    const garbled = await setup({ "api/v3/account": () => new Response("no json", { status: 200 }) });
    await run(garbled);
    expect(finishes(garbled)).toEqual([["retry", "provider_unavailable", null]]);
  });

  it("problemas con el secreto", async () => {
    const none = await setup({ "rpc:get_connection_secret": () => reply(200, []) });
    await run(none);
    expect(finishes(none)).toEqual([["failed", "no_secret", null]]);

    const t = await setup();
    const other = await importKek(toBase64(new Uint8Array(32).fill(1)), 1);
    const unreadable = { ...t.deps, keks: { current: other, byVersion: new Map([[1, other]]) } };
    await handleSyncWorker(post("secreto-de-prueba"), config, unreadable);
    expect(finishes(t)).toEqual([["failed", "secret_unreadable", null]]);

    const incomplete = await setup({}, [JOB], () => ({ apiKey: API_KEY }));
    await run(incomplete);
    expect(finishes(incomplete)).toEqual([["failed", "secret_incomplete", null]]);
  });

  it("un fallo de red al leer el secreto se reintenta, no se da por definitivo", async () => {
    const t = await setup({
      "rpc:get_connection_secret": () => {
        throw new Error("sin red");
      },
    });
    await run(t);
    expect(finishes(t)).toEqual([["retry", "internal", null]]);
  });

  it("proveedor no soportado y fallo de ingesta", async () => {
    const other = await setup({}, [{ ...JOB, provider: "etoro" }]);
    await run(other);
    expect(finishes(other)).toEqual([["failed", "unsupported_provider", null]]);
    const ingest = await setup({ "rpc:ingest_sync": () => reply(400, { code: "23514" }) });
    await run(ingest);
    expect(finishes(ingest)).toEqual([["failed", "ingest_failed", null]]);
  });

  it("procesa varios trabajos y sigue aunque uno falle", async () => {
    const t = await setup({}, [JOB, { ...JOB, job_id: 12, provider: "etoro" }]);
    const res = await run(t);
    expect(await res.json()).toEqual({ claimed: 2, done: 1, retried: 0, failed: 1 });
  });

  it("la respuesta no contiene importes, cuentas ni credenciales", async () => {
    const t = await setup();
    const body = await (await run(t)).text();
    expect(body).not.toMatch(/amount|value_minor|apiKey|privateKey|BTC|EUR/);
    expect(new JobFailure("retry", "x").retryAfterSeconds).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { handleUpdatePrices, safeEqual, type UpdatePricesConfig } from "../_shared/update-prices.ts";

const config: UpdatePricesConfig = {
  supabaseUrl: "https://proyecto.example.test",
  serviceKey: "clave-de-prueba",
  cronSecret: "secreto-de-prueba",
  quote: "EUR",
  binanceBase: "https://binance.example.test",
};
const NOW = new Date("2026-10-28T10:00:00Z");

interface Call {
  readonly url: string;
  readonly body: string | undefined;
  readonly headers: Record<string, string>;
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(handlers: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fetchFn = (input: string, init?: RequestInit) => {
    calls.push({
      url: input,
      body: typeof init?.body === "string" ? init.body : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const key = Object.keys(handlers).find((k) => input.includes(k));
    return Promise.resolve(key ? (handlers[key] as () => Response)() : reply(404, {}));
  };
  return { calls, fetchFn };
}
const post = (secret?: string) =>
  new Request("https://f.example.test/update-prices", {
    method: "POST",
    ...(secret === undefined ? {} : { headers: { "x-cron-secret": secret } }),
  });

describe("safeEqual", () => {
  it("compara secretos", async () => {
    expect(await safeEqual("abc", "abc")).toBe(true);
    expect(await safeEqual("abc", "abd")).toBe(false);
    expect(await safeEqual("", "abc")).toBe(false);
  });
});

describe("handleUpdatePrices", () => {
  it("solo acepta POST", async () => {
    const { fetchFn } = setup({});
    const res = await handleUpdatePrices(new Request("https://f.example.test/"), config, fetchFn, NOW);
    expect(res.status).toBe(405);
  });

  it("rechaza sin secreto o con un secreto equivocado, sin llamar a nadie", async () => {
    const { calls, fetchFn } = setup({});
    expect((await handleUpdatePrices(post(), config, fetchFn, NOW)).status).toBe(401);
    expect((await handleUpdatePrices(post("otro"), config, fetchFn, NOW)).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("no acepta nada si el secreto de la función no está configurado", async () => {
    const { fetchFn } = setup({});
    const res = await handleUpdatePrices(post(""), { ...config, cronSecret: "" }, fetchFn, NOW);
    expect(res.status).toBe(401);
  });

  it("actualiza los precios: lee tickers, pide a Binance y guarda con la clave del servidor", async () => {
    const { calls, fetchFn } = setup({
      crypto_tickers: () => reply(200, [{ ticker: "BTC" }, { ticker: "ETH" }, { ticker: 5 }]),
      "api/v3/ticker/price": () =>
        reply(200, [
          { symbol: "BTCEUR", price: "60000.10" },
          { symbol: "ETHEUR", price: "0" },
        ]),
      upsert_ref_prices: () => reply(200, 1),
    });
    const res = await handleUpdatePrices(post("secreto-de-prueba"), config, fetchFn, NOW);
    expect(await res.json()).toEqual({ updated: 1, rejected: 1, symbols: 2 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(calls).toHaveLength(3);
    expect(calls[0]?.headers.authorization).toBe("Bearer clave-de-prueba");
    expect(calls[1]?.url).toContain("binance.example.test");
    expect(calls[1]?.headers.authorization).toBeUndefined();
    expect(JSON.parse(calls[2]?.body ?? "{}")).toEqual({
      p_rows: [
        {
          instrument: "BTC",
          as_of: "2026-10-28",
          price: "60000.10",
          currency: "EUR",
          source: "binance:spot",
        },
      ],
    });
  });

  it("parte en varias peticiones si hay más de 100 símbolos", async () => {
    const tickers = Array.from({ length: 101 }, (_, i) => ({ ticker: `T${String(i).padStart(3, "0")}` }));
    const { calls, fetchFn } = setup({
      crypto_tickers: () => reply(200, tickers),
      "api/v3/ticker/price": () => reply(200, []),
    });
    const res = await handleUpdatePrices(post("secreto-de-prueba"), config, fetchFn, NOW);
    expect(await res.json()).toEqual({ updated: 0, rejected: 0, symbols: 101 });
    expect(calls.filter((c) => c.url.includes("ticker/price"))).toHaveLength(2);
  });

  it("sin criptoactivos no llama a Binance", async () => {
    const { calls, fetchFn } = setup({ crypto_tickers: () => reply(200, []) });
    const res = await handleUpdatePrices(post("secreto-de-prueba"), config, fetchFn, NOW);
    expect(await res.json()).toEqual({ updated: 0, rejected: 0, symbols: 0 });
    expect(calls).toHaveLength(1);
  });

  it("informa del fallo de cada paso sin detalles", async () => {
    const secret = "secreto-de-prueba";
    const tickers = reply(200, [{ ticker: "BTC" }]);
    let r = setup({ crypto_tickers: () => reply(500, {}) });
    expect((await handleUpdatePrices(post(secret), config, r.fetchFn, NOW)).status).toBe(502);

    r = setup({ crypto_tickers: () => tickers.clone(), "ticker/price": () => reply(429, {}) });
    const limited = await handleUpdatePrices(post(secret), config, r.fetchFn, NOW);
    expect(limited.status).toBe(502);
    expect(await limited.json()).toEqual({ error: "provider_failed", status: 429 });

    r = setup({
      crypto_tickers: () => tickers.clone(),
      "ticker/price": () => reply(200, [{ symbol: "BTCEUR", price: "1" }]),
      upsert_ref_prices: () => reply(500, {}),
    });
    const failed = await handleUpdatePrices(post(secret), config, r.fetchFn, NOW);
    expect(await failed.json()).toEqual({ error: "save_failed" });
  });

  it("si Binance no devuelve ningún precio válido no escribe nada", async () => {
    const { calls, fetchFn } = setup({
      crypto_tickers: () => reply(200, [{ ticker: "BTC" }]),
      "ticker/price": () => reply(200, [{ symbol: "BTCEUR", price: "x" }]),
    });
    const res = await handleUpdatePrices(post("secreto-de-prueba"), config, fetchFn, NOW);
    expect(await res.json()).toEqual({ updated: 0, rejected: 1, symbols: 1 });
    expect(calls.some((c) => c.url.includes("upsert_ref_prices"))).toBe(false);
  });
});

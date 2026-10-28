import { describe, expect, it } from "vitest";
import {
  MAX_SYMBOLS_PER_REQUEST,
  PRICE_SOURCE,
  buildTickerUrl,
  chunk,
  isTicker,
  parseTickerPrices,
  tickerSymbols,
  utcDate,
} from "../_shared/prices.ts";

describe("tickerSymbols", () => {
  it("valida, pasa a mayúsculas, deduplica, excluye la moneda y ordena", () => {
    expect(tickerSymbols(["eth", "BTC", "btc", "EUR", "no es", "A", ""], "EUR")).toEqual([
      "BTCEUR",
      "ETHEUR",
    ]);
  });
  it("sin tickers no hay símbolos", () => {
    expect(tickerSymbols([], "EUR")).toEqual([]);
  });
});

describe("isTicker", () => {
  it.each([
    ["BTC", true],
    ["1INCH", true],
    ["btc", false],
    ["B", false],
    ["TOOLONGTICKER1", false],
    ["BT-C", false],
  ])("%s → %s", (value, expected) => {
    expect(isTicker(value)).toBe(expected);
  });
});

describe("chunk", () => {
  it("parte en trozos del tamaño pedido", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
    expect(MAX_SYMBOLS_PER_REQUEST).toBe(100);
  });
});

describe("buildTickerUrl", () => {
  it("codifica la lista de símbolos como JSON en la consulta", () => {
    const url = buildTickerUrl("https://api.example.test", ["BTCEUR", "ETHEUR"]);
    expect(url).toBe(
      "https://api.example.test/api/v3/ticker/price?symbols=%5B%22BTCEUR%22%2C%22ETHEUR%22%5D",
    );
  });
});

describe("utcDate", () => {
  it("da la fecha UTC del instante", () => {
    expect(utcDate(new Date("2026-10-28T23:59:59Z"))).toBe("2026-10-28");
  });
});

describe("parseTickerPrices", () => {
  const asOf = "2026-10-28";
  it("acepta precios bien formados y fija fecha, moneda y fuente", () => {
    const { rows, rejected } = parseTickerPrices(
      [
        { symbol: "BTCEUR", price: "60123.45000000" },
        { symbol: "ETHEUR", price: "2500" },
      ],
      "EUR",
      asOf,
    );
    expect(rejected).toBe(0);
    expect(rows).toEqual([
      { instrument: "BTC", as_of: asOf, price: "60123.45000000", currency: "EUR", source: PRICE_SOURCE },
      { instrument: "ETH", as_of: asOf, price: "2500", currency: "EUR", source: PRICE_SOURCE },
    ]);
  });

  it("descarta y cuenta lo que no encaja sin detener al resto", () => {
    const { rows, rejected } = parseTickerPrices(
      [
        { symbol: "BTCEUR", price: "1.5" },
        { symbol: "BTCUSD", price: "1.5" },
        { symbol: "ETHEUR", price: "0.00000000" },
        { symbol: "ADAEUR", price: "1e5" },
        { symbol: "XRPEUR", price: 3 },
        { symbol: 7, price: "1" },
        { price: "1" },
        "texto",
        null,
        { symbol: "EUR", price: "1" },
        { symbol: "DOGEEUR", price: "1.12345678901" },
      ],
      "EUR",
      asOf,
    );
    expect(rows.map((r) => r.instrument)).toEqual(["BTC"]);
    expect(rejected).toBe(10);
  });

  it("una respuesta que no es una lista cuenta como un rechazo", () => {
    expect(parseTickerPrices({ code: -1121 }, "EUR", asOf)).toEqual({ rows: [], rejected: 1 });
  });
});

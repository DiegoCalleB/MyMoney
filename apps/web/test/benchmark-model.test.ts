import { calendarDate, money, type AccountLine } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { buildBenchmark } from "@/server/benchmark-model";
import { externalFlowRow, priceRow } from "@/server/home-model";

const today = calendarDate("2026-10-28");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const flow = (n: number, on: string, minor: number, currency = "EUR") =>
  externalFlowRow.parse({ account_id: ID(n), occurred_on: on, currency, amount_minor: minor });
const price = (on: string, value: string, currency = "EUR") =>
  priceRow.parse({ instrument: "BTC", as_of: on, price: value, currency });
const line = (n: number, minor: bigint): AccountLine => ({
  accountId: ID(n),
  basis: "valuation",
  asOf: today,
  original: money(minor, "EUR"),
  contribution: money(minor, "EUR"),
  fx: { method: "identity", effectiveRate: "1", rates: [], staleDays: 0 },
  ageDays: 0,
  stale: false,
});

describe("buildBenchmark", () => {
  const prices = [price("2026-01-05", "10"), price("2026-10-28", "20")];

  it("compara la cuenta con la referencia usando solo sus flujos", () => {
    const result = buildBenchmark(
      [flow(1, "2026-01-05", 100_00), flow(2, "2026-01-05", 999_00)],
      line(1, 150_00n),
      prices,
      today,
    );
    expect(result.ok && result.value.value.contributed).toEqual(money(100_00n, "EUR"));
    expect(result.ok && result.value.value.benchmarkValue).toEqual(money(200_00n, "EUR"));
    expect(result.ok && result.value.value.difference).toEqual(money(-50_00n, "EUR"));
  });

  it("ignora flujos y precios en otra moneda", () => {
    const result = buildBenchmark(
      [flow(1, "2026-01-05", 100_00), flow(1, "2026-01-05", 5_00, "USD")],
      line(1, 150_00n),
      [...prices, price("2026-10-28", "999", "USD")],
      today,
    );
    expect(result.ok && result.value.value.contributed).toEqual(money(100_00n, "EUR"));
    expect(result.ok && result.value.value.benchmarkValue).toEqual(money(200_00n, "EUR"));
  });

  it("sin precios a la fecha de una aportación explica que faltan", () => {
    const result = buildBenchmark([flow(1, "2025-01-01", 100_00)], line(1, 1n), prices, today);
    expect(result).toEqual({
      ok: false,
      error: { code: "benchmark.no_price", params: { date: "2025-01-01" } },
    });
  });
});

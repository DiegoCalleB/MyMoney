import { describe, expect, it } from "vitest";
import {
  calendarDate,
  compareWithBenchmark,
  dec,
  money,
  type ExternalFlow,
  type PricePoint,
} from "../../src";

const d = calendarDate;
const eur = (minor: bigint) => money(minor, "EUR");
const flow = (date: string, minor: bigint): ExternalFlow => ({ date: d(date), amount: eur(minor) });
const price = (date: string, value: string): PricePoint => ({ date: d(date), price: dec(value) });
const run = (flows: ExternalFlow[], portfolio: bigint, prices: PricePoint[], on = "2026-10-28") => {
  const r = compareWithBenchmark({
    currency: "EUR",
    flows,
    portfolioValue: eur(portfolio),
    prices,
    onDate: d(on),
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("compareWithBenchmark", () => {
  it("aplica las mismas aportaciones a la referencia y la valora hoy", () => {
    // 1000 € a precio 10 (100 participaciones) y 500 € a precio 20 (25): 125 × 30 = 3750 €.
    const r = run([flow("2026-01-05", 1_000_00n), flow("2026-06-10", 500_00n)], 1_800_00n, [
      price("2026-01-05", "10"),
      price("2026-06-10", "20"),
      price("2026-10-28", "30"),
    ]);
    expect(r.value.contributed).toEqual(eur(1_500_00n));
    expect(r.value.benchmarkValue).toEqual(eur(3_750_00n));
    expect(r.value.benchmarkGain).toEqual(eur(2_250_00n));
    expect(r.value.portfolioGain).toEqual(eur(300_00n));
    expect(r.value.difference).toEqual(eur(-1_950_00n));
    expect(r.value.portfolioReturn?.toFixed(2)).toBe("0.20");
    expect(r.value.benchmarkReturn?.toFixed(2)).toBe("1.50");
    expect(r.explanation).toMatchObject({
      method: "benchmark.same_flows",
      flowCount: 2,
      firstFlowDate: "2026-01-05",
      lastPriceDate: "2026-10-28",
      caveats: [],
    });
  });

  it("usa el último precio conocido a la fecha de cada flujo, sin mirar el futuro", () => {
    const r = run([flow("2026-02-10", 100_00n)], 100_00n, [
      price("2026-02-01", "10"),
      price("2026-02-20", "1000"), // posterior al flujo: no cuenta para comprar
      price("2026-10-28", "10"),
    ]);
    expect(r.value.benchmarkValue).toEqual(eur(100_00n));
  });

  it("una retirada vende participaciones al precio de ese día", () => {
    const r = run([flow("2026-01-05", 1_000_00n), flow("2026-03-01", -500_00n)], 600_00n, [
      price("2026-01-05", "10"),
      price("2026-03-01", "20"),
      price("2026-10-28", "20"),
    ]);
    // 100 − 25 = 75 participaciones × 20 = 1500 €; aportado neto 500 €.
    expect(r.value.contributed).toEqual(eur(500_00n));
    expect(r.value.benchmarkValue).toEqual(eur(1_500_00n));
  });

  it("ignora flujos y precios posteriores a hoy", () => {
    const r = run([flow("2026-01-05", 100_00n), flow("2027-01-01", 999_00n)], 100_00n, [
      price("2026-01-05", "10"),
      price("2026-10-28", "10"),
      price("2027-01-01", "1"),
    ]);
    expect(r.value.contributed).toEqual(eur(100_00n));
    expect(r.explanation.flowCount).toBe(1);
  });

  it("avisa de un precio desfasado y de un aportado no positivo", () => {
    const stale = run([flow("2026-01-05", 100_00n)], 100_00n, [price("2026-01-05", "10")]);
    expect(stale.explanation.caveats).toEqual(["benchmark.caveat.stale_price"]);
    expect(stale.explanation.lastPriceDate).toBe("2026-01-05");

    const none = run([flow("2026-01-05", 100_00n), flow("2026-01-06", -100_00n)], 0n, [
      price("2026-01-05", "10"),
      price("2026-10-28", "10"),
    ]);
    expect(none.explanation.caveats).toEqual(["benchmark.caveat.no_positive_contribution"]);
    expect(none.value.portfolioReturn).toBeNull();
    expect(none.value.benchmarkReturn).toBeNull();
  });

  it("falla con códigos claros", () => {
    const prices = [price("2026-01-05", "10"), price("2026-10-28", "10")];
    const input = { currency: "EUR" as const, portfolioValue: eur(1n), onDate: d("2026-10-28") };
    expect(compareWithBenchmark({ ...input, flows: [], prices })).toEqual({
      ok: false,
      error: { code: "benchmark.no_flows" },
    });
    expect(compareWithBenchmark({ ...input, flows: [flow("2026-01-01", 100n)], prices })).toEqual({
      ok: false,
      error: { code: "benchmark.no_price", params: { date: "2026-01-01" } },
    });
    expect(
      compareWithBenchmark({
        ...input,
        flows: [flow("2026-01-05", 100n), flow("2026-02-01", -200n)],
        prices,
      }),
    ).toEqual({
      ok: false,
      error: { code: "benchmark.oversold", params: { date: "2026-02-01" } },
    });
    for (const bad of ["0", "-1", "NaN"]) {
      expect(
        compareWithBenchmark({
          ...input,
          flows: [flow("2026-01-05", 100n)],
          prices: [price("2026-01-05", bad)],
        }),
      ).toEqual({ ok: false, error: { code: "benchmark.invalid_price" } });
    }
    expect(
      compareWithBenchmark({
        ...input,
        portfolioValue: money(1n, "USD"),
        flows: [flow("2026-01-05", 100n)],
        prices,
      }),
    ).toEqual({ ok: false, error: { code: "benchmark.currency_mismatch" } });
    expect(
      compareWithBenchmark({
        ...input,
        flows: [{ date: d("2026-01-05"), amount: money(1n, "USD") }],
        prices,
      }),
    ).toEqual({ ok: false, error: { code: "benchmark.currency_mismatch" } });
  });
});

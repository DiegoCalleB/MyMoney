import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDate,
  compareWithBenchmark,
  dec,
  money,
  type ExternalFlow,
} from "../../src";

const RUNS = { numRuns: 1000 };
const onDate = calendarDate("2026-10-28");
const start = calendarDate("2026-01-01");

const flows = fc.array(
  fc.record({
    offset: fc.integer({ min: 0, max: 200 }),
    minor: fc.bigInt({ min: 1n, max: 10n ** 9n }),
  }),
  { minLength: 1, maxLength: 12 },
);
const toFlows = (rows: { offset: number; minor: bigint }[]): ExternalFlow[] =>
  rows.map((r) => ({ date: addDays(start, r.offset), amount: money(r.minor, "EUR") }));
const go = (rows: { offset: number; minor: bigint }[], price: string, k = 1n) => {
  const r = compareWithBenchmark({
    currency: "EUR",
    flows: toFlows(rows).map((f) => ({ ...f, amount: money(f.amount.minor * k, "EUR") })),
    portfolioValue: money(0n, "EUR"),
    prices: [
      { date: start, price: dec(price) },
      { date: onDate, price: dec(price) },
    ],
    onDate,
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value.value;
};

describe("compareWithBenchmark (propiedades)", () => {
  it("con precio constante la referencia vale lo aportado", () => {
    fc.assert(
      fc.property(flows, fc.constantFrom("1", "7.5", "123.456789"), (rows, price) => {
        const v = go(rows, price);
        // Un único redondeo al céntimo: como mucho una unidad mínima de diferencia.
        const diff = v.benchmarkValue.minor - v.contributed.minor;
        expect(diff >= -1n && diff <= 1n).toBe(true);
      }),
      RUNS,
    );
  });

  it("el orden de los flujos no cambia el resultado", () => {
    fc.assert(
      fc.property(flows, (rows) => {
        expect(go([...rows].reverse(), "3.3")).toEqual(go(rows, "3.3"));
      }),
      RUNS,
    );
  });

  it("escalar las aportaciones escala la referencia (salvo el redondeo)", () => {
    fc.assert(
      fc.property(flows, fc.integer({ min: 2, max: 9 }), (rows, k) => {
        const base = go(rows, "1");
        const scaled = go(rows, "1", BigInt(k));
        const diff = scaled.benchmarkValue.minor - base.benchmarkValue.minor * BigInt(k);
        expect(diff >= -BigInt(k) && diff <= BigInt(k)).toBe(true);
      }),
      RUNS,
    );
  });
});

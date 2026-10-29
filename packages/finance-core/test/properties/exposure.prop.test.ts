import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calendarDate, exposure, money, type ExposurePosition } from "../../src";

const RUNS = { numRuns: 1000 };
const onDate = calendarDate("2026-10-28");
const keys = ["usa", "europa", "emergentes", "japon"] as const;

// Pesos válidos: cada clave entre 0 y 2500 → la suma nunca pasa de 10000.
const composition = fc.array(
  fc.record({ key: fc.constantFrom(...keys), weightBps: fc.integer({ min: 0, max: 2500 }) }),
  { maxLength: 4 },
);
const positions = fc.array(
  fc.record({ minor: fc.bigInt({ min: 0n, max: 10n ** 12n }), composition }),
  { maxLength: 8 },
);
const build = (rows: { minor: bigint; composition: { key: string; weightBps: number }[] }[]) =>
  rows.map<ExposurePosition>((r, i) => ({
    assetId: `a${String(i)}`,
    value: money(r.minor, "EUR"),
    composition: r.composition.map((c) => ({ asOf: calendarDate("2026-09-30"), ...c })),
  }));

const go = (rows: Parameters<typeof build>[0], reverse = false) => {
  const list = build(rows);
  const r = exposure({
    dimension: "region",
    currency: "EUR",
    positions: reverse ? list.reverse() : list,
    onDate,
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("exposure (propiedades)", () => {
  it("clasificado + sin clasificar = total, al céntimo", () => {
    fc.assert(
      fc.property(positions, (rows) => {
        const { value } = go(rows);
        const classified = value.buckets.reduce((acc, b) => acc + b.amount.minor, 0n);
        expect(classified + value.unclassified.minor).toBe(value.total.minor);
        expect(value.total.minor).toBe(rows.reduce((acc, p) => acc + p.minor, 0n));
      }),
      RUNS,
    );
  });

  it("ningún cubo ni el sin clasificar es negativo", () => {
    fc.assert(
      fc.property(positions, (rows) => {
        const { value } = go(rows);
        expect(value.unclassified.minor >= 0n).toBe(true);
        for (const b of value.buckets) expect(b.amount.minor >= 0n).toBe(true);
      }),
      RUNS,
    );
  });

  it("el orden de las posiciones no cambia el total ni las claves", () => {
    fc.assert(
      fc.property(positions, (rows) => {
        const forward = go(rows);
        const reversed = go(rows, true);
        expect(reversed.value.total).toEqual(forward.value.total);
        const keysOf = (x: typeof forward) => x.value.buckets.map((b) => b.key).sort();
        expect(keysOf(reversed)).toEqual(keysOf(forward));
      }),
      RUNS,
    );
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MINOR_UNITS,
  add,
  allocate,
  calendarDate,
  convert,
  dec,
  fromDecimal,
  money,
  sub,
  toDecimal,
  type CurrencyCode,
  type FxRate,
} from "../../src";

const RUNS = { numRuns: 1000 };
const currencies = Object.keys(MINOR_UNITS) as CurrencyCode[];
const minor = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });
const currency = fc.constantFrom(...currencies);

describe("propiedades de Money", () => {
  it("add y sub son inversas", () => {
    fc.assert(
      fc.property(minor, minor, currency, (a, b, c) => {
        expect(sub(add(money(a, c), money(b, c)), money(b, c))).toEqual(money(a, c));
      }),
      RUNS,
    );
  });

  it("toDecimal → fromDecimal es la identidad", () => {
    fc.assert(
      fc.property(minor, currency, (a, c) => {
        expect(fromDecimal(toDecimal(money(a, c)), c)).toEqual(money(a, c));
      }),
      RUNS,
    );
  });

  it("allocate conserva el total y cada parte dista menos de 1 de su parte ideal", () => {
    fc.assert(
      fc.property(
        minor,
        fc.array(fc.bigInt({ min: 0n, max: 10_000n }), { minLength: 1, maxLength: 12 }),
        (a, weights) => {
          fc.pre(weights.some((w) => w > 0n));
          const parts = allocate(money(a, "EUR"), weights);
          expect(parts.reduce((acc, p) => acc + p.minor, 0n)).toBe(a);
          const total = weights.reduce((x, w) => x + w, 0n);
          parts.forEach((p, i) => {
            const ideal = dec(a)
              .mul(dec(weights[i] as bigint))
              .div(dec(total));
            expect(dec(p.minor).sub(ideal).abs().lessThan(1)).toBe(true);
          });
        },
      ),
      RUNS,
    );
  });
});

describe("propiedades de convert", () => {
  const rateArb = fc.integer({ min: 1, max: 5_000_000 }).map((n) => dec(String(n)).div(10_000)); // tipos entre 0,0001 y 500

  it("ida y vuelta con tipos inversos exactos pierde como mucho el error de dos redondeos", () => {
    fc.assert(
      fc.property(minor, rateArb, (a, rate) => {
        const onDate = calendarDate("2026-10-23");
        const rates: FxRate[] = [{ base: "EUR", quote: "USD", asOf: onDate, rate, source: "test" }];
        const there = convert(money(a, "EUR"), "USD", rates, onDate);
        if (!there.ok) throw new Error("debía convertir");
        const back = convert(there.value.value, "EUR", rates, onDate);
        if (!back.ok) throw new Error("debía convertir");
        // Error máximo: 0,5 unidades mínimas en USD llevadas a EUR, más 0,5 del segundo redondeo.
        const bound = dec("0.5").div(rate).add(dec("0.5"));
        expect(
          dec(back.value.value.minor - a)
            .abs()
            .lte(bound),
        ).toBe(true);
      }),
      RUNS,
    );
  });

  it("convertir es monótono: más importe nunca da menos", () => {
    fc.assert(
      fc.property(minor, minor, rateArb, (a, b, rate) => {
        const onDate = calendarDate("2026-10-23");
        const rates: FxRate[] = [{ base: "EUR", quote: "GBP", asOf: onDate, rate, source: "test" }];
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const x = convert(money(lo, "EUR"), "GBP", rates, onDate);
        const y = convert(money(hi, "EUR"), "GBP", rates, onDate);
        if (!x.ok || !y.ok) throw new Error("debía convertir");
        expect(x.value.value.minor <= y.value.value.minor).toBe(true);
      }),
      RUNS,
    );
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  dec,
  money,
  savingsTax,
  transferVsSale,
  type ParameterSource,
  type TaxBracket,
} from "../../src";

const RUNS = { numRuns: 1000 };
const source: ParameterSource = {
  fiscalYear: 2026,
  sourceUrl: "https://example.test",
  verifiedOn: "2026-10-28",
};
const eur = (minor: bigint) => money(minor, "EUR");
const brackets: TaxBracket[] = [
  { upTo: eur(6_000_00n), rate: dec("0.19") },
  { upTo: eur(50_000_00n), rate: dec("0.21") },
  { upTo: eur(200_000_00n), rate: dec("0.23") },
  { upTo: null, rate: dec("0.28") },
];
const gain = fc.bigInt({ min: -(10n ** 9n), max: 10n ** 11n });

const taxOf = (g: bigint) => {
  const r = savingsTax(eur(g), brackets, source);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("savingsTax (propiedades)", () => {
  it("la cuota nunca es negativa ni supera el tipo máximo sobre la ganancia", () => {
    fc.assert(
      fc.property(gain, (g) => {
        const { tax } = taxOf(g).value;
        expect(tax.minor >= 0n).toBe(true);
        if (g > 0n) expect(tax.minor <= (g * 28n) / 100n + 4n).toBe(true);
      }),
      RUNS,
    );
  });

  it("las bases de los tramos suman la ganancia positiva", () => {
    fc.assert(
      fc.property(gain, (g) => {
        const total = taxOf(g).value.byBracket.reduce((acc, b) => acc + b.base.minor, 0n);
        expect(total).toBe(g > 0n ? g : 0n);
      }),
      RUNS,
    );
  });

  it("es monótona: más ganancia nunca paga menos", () => {
    fc.assert(
      fc.property(gain, fc.bigInt({ min: 0n, max: 10n ** 9n }), (g, extra) => {
        expect(taxOf(g + extra).value.tax.minor >= taxOf(g).value.tax.minor).toBe(true);
      }),
      RUNS,
    );
  });
});

describe("transferVsSale (propiedades)", () => {
  const amounts = fc.bigInt({ min: 0n, max: 10n ** 11n });
  const bps = fc.integer({ min: 0, max: 400 });

  it("el traspaso nunca paga impuestos y conserva todo el dinero invertido", () => {
    fc.assert(
      fc.property(amounts, amounts, bps, bps, (value, cost, cur, target) => {
        const r = transferVsSale({
          value: eur(value),
          costBasis: eur(cost),
          brackets,
          source,
          currentTerBps: cur,
          targetTerBps: target,
        });
        if (!r.ok) throw new Error(r.error.code);
        expect(r.value.value.transfer.taxNow.minor).toBe(0n);
        expect(r.value.value.transfer.invested.minor).toBe(value);
        expect(r.value.value.sale.invested.minor + r.value.value.sale.taxNow.minor).toBe(value);
      }),
      RUNS,
    );
  });

  it("con un destino más barato, vender nunca ahorra más comisiones que el traspaso", () => {
    fc.assert(
      fc.property(amounts, amounts, bps, bps, (value, cost, cur, target) => {
        fc.pre(target <= cur);
        const r = transferVsSale({
          value: eur(value),
          costBasis: eur(cost),
          brackets,
          source,
          currentTerBps: cur,
          targetTerBps: target,
        });
        if (!r.ok) throw new Error(r.error.code);
        expect(
          r.value.value.sale.annualFeeSaving.minor <=
            r.value.value.transfer.annualFeeSaving.minor + 1n,
        ).toBe(true);
      }),
      RUNS,
    );
  });
});

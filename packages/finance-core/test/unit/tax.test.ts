import { describe, expect, it } from "vitest";
import {
  dec,
  money,
  pensionRoom,
  savingsTax,
  transferVsSale,
  type ParameterSource,
  type TaxBracket,
} from "../../src";

const eur = (minor: bigint) => money(minor, "EUR");
const source: ParameterSource = {
  fiscalYear: 2026,
  sourceUrl: "https://example.test/boe",
  verifiedOn: "2026-10-28",
};
// Escala INVENTADA para los tests (las cifras reales salen de ref.tax_parameters, nunca del código).
const brackets: TaxBracket[] = [
  { upTo: eur(6_000_00n), rate: dec("0.10") },
  { upTo: eur(50_000_00n), rate: dec("0.20") },
  { upTo: null, rate: dec("0.30") },
];
const tax = (gain: bigint, b: TaxBracket[] = brackets) => {
  const r = savingsTax(eur(gain), b, source);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("savingsTax", () => {
  it("aplica cada tramo a su parte de la ganancia", () => {
    const r = tax(60_000_00n);
    // 6.000×10 % + 44.000×20 % + 10.000×30 % = 600 + 8.800 + 3.000 = 12.400 €
    expect(r.value.tax).toEqual(eur(12_400_00n));
    expect(r.value.byBracket.map((b) => b.base.minor)).toEqual([6_000_00n, 44_000_00n, 10_000_00n]);
    expect(r.value.effectiveRate?.toFixed(4)).toBe("0.2067");
    expect(r.explanation.source).toEqual(source);
    expect(r.explanation.caveats).toEqual(["tax.caveat.losses_not_offset", "tax.caveat.estimate"]);
  });

  it("una ganancia dentro del primer tramo solo usa ese tramo", () => {
    const r = tax(1_000_00n);
    expect(r.value.tax).toEqual(eur(100_00n));
    expect(r.value.byBracket.map((b) => b.base.minor)).toEqual([1_000_00n, 0n, 0n]);
  });

  it("justo en el límite de un tramo no pasa al siguiente", () => {
    expect(tax(6_000_00n).value.tax).toEqual(eur(600_00n));
    // Un céntimo por encima del límite paga al 20 % solo ese céntimo (0,002 € → 0,00 €).
    expect(tax(6_000_01n).value.tax).toEqual(eur(600_00n));
    expect(tax(6_100_00n).value.tax).toEqual(eur(620_00n));
  });

  it("una pérdida o ganancia cero no paga y no tiene tipo efectivo", () => {
    for (const gain of [0n, -500_00n]) {
      const r = tax(gain);
      expect(r.value.tax).toEqual(eur(0n));
      expect(r.value.effectiveRate).toBeNull();
    }
  });

  it("redondea al céntimo con redondeo bancario", () => {
    // 0,05 € × 10 % = 0,005 → 0,00 (al par); 0,15 € × 10 % = 0,015 → 0,02.
    expect(tax(5n).value.tax).toEqual(eur(0n));
    expect(tax(15n).value.tax).toEqual(eur(2n));
  });

  it("rechaza escalas mal formadas", () => {
    const bad: TaxBracket[][] = [
      [],
      [{ upTo: eur(100n), rate: dec("0.1") }], // sin tramo final
      [
        { upTo: null, rate: dec("0.1") },
        { upTo: null, rate: dec("0.2") },
      ], // sin límite no al final
      [
        { upTo: eur(100n), rate: dec("0.1") },
        { upTo: eur(100n), rate: dec("0.2") },
        { upTo: null, rate: dec("0.3") },
      ], // no crece
      [
        { upTo: money(100n, "USD"), rate: dec("0.1") },
        { upTo: null, rate: dec("0.3") },
      ],
      [
        { upTo: eur(100n), rate: dec("-0.1") },
        { upTo: null, rate: dec("0.3") },
      ],
      [
        { upTo: eur(100n), rate: dec("1.5") },
        { upTo: null, rate: dec("0.3") },
      ],
      [
        { upTo: eur(100n), rate: dec("NaN") },
        { upTo: null, rate: dec("0.3") },
      ],
    ];
    for (const b of bad) {
      expect(savingsTax(eur(1000n), b, source)).toEqual({
        ok: false,
        error: { code: "tax.brackets_invalid" },
      });
    }
  });
});

describe("pensionRoom", () => {
  const room = (limit: bigint, contributed: bigint) => {
    const r = pensionRoom({ limit: eur(limit), contributed: eur(contributed), source });
    if (!r.ok) throw new Error(r.error.code);
    return r.value;
  };

  it("calcula lo que queda hasta el límite", () => {
    const r = room(1_500_00n, 400_00n);
    expect(r.value.remaining).toEqual(eur(1_100_00n));
    expect(r.value.excess).toEqual(eur(0n));
    expect(r.value.fractionUsed?.toFixed(4)).toBe("0.2667");
    expect(r.explanation.caveats).toContain("tax.caveat.employer_limit_not_split");
    expect(r.explanation.source).toEqual(source);
  });

  it("con el límite justo alcanzado no queda margen ni exceso", () => {
    const r = room(1_500_00n, 1_500_00n);
    expect([r.value.remaining.minor, r.value.excess.minor]).toEqual([0n, 0n]);
  });

  it("si se supera, informa del exceso", () => {
    const r = room(1_500_00n, 1_800_00n);
    expect([r.value.remaining.minor, r.value.excess.minor]).toEqual([0n, 300_00n]);
  });

  it("con límite cero no hay fracción", () => {
    expect(room(0n, 0n).value.fractionUsed).toBeNull();
  });

  it("rechaza monedas distintas e importes negativos", () => {
    expect(pensionRoom({ limit: eur(1n), contributed: money(1n, "USD"), source })).toEqual({
      ok: false,
      error: { code: "tax.currency_mismatch" },
    });
    expect(pensionRoom({ limit: eur(-1n), contributed: eur(1n), source })).toEqual({
      ok: false,
      error: { code: "tax.negative_amount" },
    });
    expect(pensionRoom({ limit: eur(1n), contributed: eur(-1n), source })).toEqual({
      ok: false,
      error: { code: "tax.negative_amount" },
    });
  });
});

describe("transferVsSale", () => {
  const run = (over: Partial<Parameters<typeof transferVsSale>[0]> = {}) => {
    const r = transferVsSale({
      value: eur(100_000_00n),
      costBasis: eur(80_000_00n),
      brackets,
      source,
      currentTerBps: 150,
      targetTerBps: 20,
      ...over,
    });
    if (!r.ok) throw new Error(r.error.code);
    return r.value;
  };

  it("el traspaso no tributa ahora y la venta sí; ambos ahorran comisiones", () => {
    const r = run();
    // Ganancia 20.000 €: 6.000×10 % + 14.000×20 % = 3.400 €.
    expect(r.value.gain).toEqual(eur(20_000_00n));
    expect(r.value.transfer.taxNow).toEqual(eur(0n));
    expect(r.value.transfer.invested).toEqual(eur(100_000_00n));
    // Comisión actual 1,5 % = 1.500 €; destino 0,2 % = 200 € → ahorro 1.300 €.
    expect(r.value.transfer.annualFeeSaving).toEqual(eur(1_300_00n));
    expect(r.value.sale.taxNow).toEqual(eur(3_400_00n));
    expect(r.value.sale.invested).toEqual(eur(96_600_00n));
    // Tras vender quedan 96.600 € que cambian de producto: 0,013 × 96.600 = 1.255,80 €.
    expect(r.value.sale.annualFeeSaving).toEqual(eur(1_255_80n));
    expect(r.value.saleBreakEvenYears?.toFixed(2)).toBe("2.71");
    expect(r.explanation.assumptions).toContain("tax.assumption.transfer_defers_tax");
    expect(r.explanation.caveats).toContain("tax.caveat.estimate");
  });

  it("sin ganancia, vender no cuesta impuestos y compensa al instante", () => {
    const r = run({ costBasis: eur(100_000_00n) });
    expect(r.value.sale.taxNow).toEqual(eur(0n));
    expect(r.value.saleBreakEvenYears?.toFixed(0)).toBe("0");
    const loss = run({ costBasis: eur(120_000_00n) });
    expect(loss.value.gain).toEqual(eur(-20_000_00n));
    expect(loss.value.sale.taxNow).toEqual(eur(0n));
  });

  it("si el destino no es más barato, la venta no compensa nunca", () => {
    const r = run({ currentTerBps: 20, targetTerBps: 150 });
    expect(r.value.transfer.annualFeeSaving.minor < 0n).toBe(true);
    expect(r.value.saleBreakEvenYears).toBeNull();
  });

  it("valida monedas, importes, comisiones y escala", () => {
    const base = {
      value: eur(1000n),
      costBasis: eur(500n),
      brackets,
      source,
      currentTerBps: 100,
      targetTerBps: 10,
    };
    const code = (over: object) => {
      const r = transferVsSale({ ...base, ...over });
      return r.ok ? "ok" : r.error.code;
    };
    expect(code({ costBasis: money(1n, "USD") })).toBe("tax.currency_mismatch");
    expect(code({ value: eur(-1n) })).toBe("tax.negative_amount");
    expect(code({ costBasis: eur(-1n) })).toBe("tax.negative_amount");
    for (const bps of [-1, 1.5, 10_001]) {
      expect(code({ currentTerBps: bps })).toBe("tax.ter_invalid");
      expect(code({ targetTerBps: bps })).toBe("tax.ter_invalid");
    }
    expect(code({ brackets: [] })).toBe("tax.brackets_invalid");
  });
});

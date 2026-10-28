import { describe, expect, it } from "vitest";
import { calendarDate, convert, dec, money, type FxRate } from "../../src";

const d = calendarDate;
const ecb = (quote: FxRate["quote"], asOf: string, rate: string): FxRate => ({
  base: "EUR",
  quote,
  asOf: d(asOf),
  rate: dec(rate),
  source: "BCE",
});

const rates: FxRate[] = [
  ecb("USD", "2026-10-22", "1.1000"),
  ecb("USD", "2026-10-23", "1.1600"),
  ecb("GBP", "2026-10-23", "0.8700"),
  ecb("JPY", "2026-10-23", "175.00"),
];

describe("convert", () => {
  it("devuelve el mismo importe si la moneda coincide", () => {
    const r = convert(money(100n, "EUR"), "EUR", rates, d("2026-10-26"));
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.value).toEqual(money(100n, "EUR"));
    expect(r.value.explanation.method).toBe("identity");
  });

  it("usa el último tipo publicado en o antes de la fecha (fin de semana → viernes)", () => {
    const r = convert(money(10000n, "EUR"), "USD", rates, d("2026-10-25"));
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.value).toEqual(money(11600n, "USD"));
    expect(r.value.explanation).toMatchObject({
      method: "direct",
      effectiveRate: "1.16",
      staleDays: 2,
    });
  });

  it("elige el más reciente aunque la lista no venga ordenada", () => {
    const r = convert(money(10000n, "EUR"), "USD", [...rates].reverse(), d("2026-10-25"));
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.value).toEqual(money(11600n, "USD"));
  });

  it("no usa tipos publicados después de la fecha", () => {
    const r = convert(money(10000n, "EUR"), "USD", rates, d("2026-10-22"));
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.value).toEqual(money(11000n, "USD"));
  });

  it("invierte el par si solo existe el contrario", () => {
    const r = convert(money(11600n, "USD"), "EUR", rates, d("2026-10-23"));
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.value).toEqual(money(10000n, "EUR"));
    expect(r.value.explanation.method).toBe("inverse");
  });

  it("prefiere el sentido más reciente cuando existen los dos", () => {
    const withBoth = [
      ...rates,
      { ...ecb("USD", "2026-10-24", "0"), base: "USD", quote: "EUR", rate: dec("0.5") } as FxRate,
    ];
    const r = convert(money(100n, "EUR"), "USD", withBoth, d("2026-10-24"));
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.explanation.method).toBe("inverse");
    expect(r.value.value).toEqual(money(200n, "USD"));
  });

  it("cruza a través del EUR (USD → GBP) y lo explica", () => {
    const r = convert(money(11600n, "USD"), "GBP", rates, d("2026-10-23"));
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.value).toEqual(money(8700n, "GBP"));
    expect(r.value.explanation.method).toBe("cross");
    expect(r.value.explanation.rates).toHaveLength(2);
  });

  it("respeta los decimales de la moneda destino (JPY sin decimales)", () => {
    const r = convert(money(1n, "EUR"), "JPY", rates, d("2026-10-23"), { rounding: "HALF_UP" });
    if (!r.ok) throw new Error("debía convertir");
    expect(r.value.value).toEqual(money(2n, "JPY")); // 0,01 € × 175 = 1,75 ¥ → 2 ¥
  });

  it("devuelve un error explicable si no hay tipo", () => {
    expect(convert(money(1n, "EUR"), "CHF", rates, d("2026-10-23"))).toEqual({
      ok: false,
      error: {
        code: "fx.rate_not_found",
        params: { from: "EUR", to: "CHF", onDate: "2026-10-23" },
      },
    });
    expect(convert(money(1n, "USD"), "CHF", rates, d("2026-10-23")).ok).toBe(false);
    expect(convert(money(1n, "USD"), "GBP", rates, d("2026-10-01")).ok).toBe(false);
  });
});

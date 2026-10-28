import { describe, expect, it } from "vitest";
import { calendarDate, money, returns, type ExternalFlow } from "../../src";

const d = calendarDate;
const eur = (minor: bigint) => money(minor, "EUR");
const flow = (date: string, minor: bigint): ExternalFlow => ({ date: d(date), amount: eur(minor) });

const run = (flows: ExternalFlow[], value: bigint, onDate = "2026-10-27") => {
  const r = returns({ flows, currentValue: eur(value), onDate: d(onDate) });
  if (!r.ok) throw new Error("se esperaba resultado");
  return r.value;
};

describe("returns", () => {
  it("sin aportaciones no es calculable", () => {
    expect(returns({ flows: [], currentValue: eur(1n), onDate: d("2026-10-27") })).toEqual({
      ok: false,
      error: { code: "returns.no_flows" },
    });
    // Los flujos posteriores a «hoy» no cuentan.
    const future = returns({
      flows: [flow("2027-01-01", 100n)],
      currentValue: eur(1n),
      onDate: d("2026-10-27"),
    });
    expect(future.ok).toBe(false);
  });

  it("calcula aportado, ganancia y rentabilidad simple", () => {
    const r = run([flow("2026-09-01", 100_000_00n)], 110_000_00n);
    expect(r.value.contributed).toEqual(eur(100_000_00n));
    expect(r.value.gain).toEqual(eur(10_000_00n));
    expect(r.value.simple?.toFixed(4)).toBe("0.1000");
  });

  it("con menos de un año no anualiza y lo explica", () => {
    const r = run([flow("2026-09-01", 100_00n)], 105_00n);
    expect(r.value.annualized).toBeNull();
    expect(r.explanation.caveats).toContain("returns.caveat.short_period");
    expect(r.explanation.caveats).toContain("returns.caveat.single_flow_date");
    expect(r.explanation.periodDays).toBe(56);
  });

  it("anualiza con un solo flujo: 21 % en dos años ≈ 10 % anual", () => {
    const r = run([flow("2024-10-27", 100_00n)], 121_00n);
    expect(r.value.annualized?.toFixed(4)).toBe("0.1000");
  });

  it("pondera por dinero con varias aportaciones", () => {
    // 100 hace 2 años, 100 hace 1 año; hoy valen 231 → r ≈ 10 %: 100·1,21 + 100·1,1 = 231.
    const r = run([flow("2024-10-27", 100_00n), flow("2025-10-27", 100_00n)], 231_00n);
    expect(r.value.annualized?.toFixed(3)).toBe("0.100");
    expect(r.explanation.caveats).not.toContain("returns.caveat.single_flow_date");
  });

  it("agrega los flujos del mismo día y admite retiradas", () => {
    const r = run(
      [flow("2024-10-27", 60_00n), flow("2024-10-27", 40_00n), flow("2025-10-27", -10_00n)],
      110_00n,
    );
    expect(r.value.contributed).toEqual(eur(90_00n));
    expect(r.value.gain).toEqual(eur(20_00n));
    expect(r.explanation.flowCount).toBe(3);
  });

  it("rentabilidad negativa y valor final cero", () => {
    expect(run([flow("2024-10-27", 100_00n)], 81_00n).value.annualized?.toFixed(4)).toBe("-0.1000");
    const zeroValue = run([flow("2024-10-27", 100_00n)], 0n);
    expect(zeroValue.value.simple?.toFixed(2)).toBe("-1.00");
    expect(zeroValue.value.annualized).toBeNull();
    expect(zeroValue.explanation.caveats).toContain("returns.caveat.no_solution");
  });

  it("sin aportado positivo no hay rentabilidad simple", () => {
    const r = run([flow("2024-10-27", 100_00n), flow("2025-10-27", -100_00n)], 5_00n);
    expect(r.value.simple).toBeNull();
    expect(r.value.annualized).toBeNull();
    expect(r.explanation.caveats).toContain("returns.caveat.no_positive_contribution");
  });

  it("avisa de varias soluciones posibles cuando el signo cambia más de una vez", () => {
    const r = run(
      [flow("2023-10-27", 100_00n), flow("2024-10-27", -250_00n), flow("2025-10-27", 160_00n)],
      10_00n,
    );
    expect(r.value.annualized).toBeNull();
    expect(r.explanation.caveats).toContain("returns.caveat.multiple_roots");
  });

  it("una rentabilidad fuera de rango (más de 1000 % anual) no se da", () => {
    const r = run([flow("2024-10-27", 1_00n)], 1_000_000_00n);
    expect(r.value.annualized).toBeNull();
    expect(r.explanation.caveats).toContain("returns.caveat.no_solution");
  });
});

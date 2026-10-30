import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  STRESS_DROPS_BPS,
  investPathScenarios,
  money,
  profileFacts,
  type InvestPathInput,
} from "../../src";

const eur = (minor: bigint) => money(minor, "EUR");

describe("profileFacts", () => {
  const base = {
    total: eur(10_000_000n),
    liquid: eur(2_000_000n),
    risk: eur(5_000_000n),
    monthlyExpense: eur(200_000n),
  };

  it("reparte, cubre gastos y simula caídas", () => {
    const { value, explanation } = profileFacts(base);
    expect(value.riskShareBps).toBe(5000);
    expect(value.liquidityMonthsTenths).toBe(100n); // 10,0 meses
    expect(value.stress.map((s) => s.dropBps)).toEqual([...STRESS_DROPS_BPS]);
    const thirty = value.stress.find((s) => s.dropBps === 3000);
    expect(thirty?.loss.minor).toBe(1_500_000n);
    expect(thirty?.lossShareBps).toBe(1500);
    expect(explanation.dataQuality).toBe("high");
    expect(explanation.assumptions).toContain("profile_facts.stress_is_illustrative_not_forecast");
  });

  it("sin gasto conocido no calcula meses y baja la calidad", () => {
    const { value, explanation } = profileFacts({ ...base, monthlyExpense: null });
    expect(value.liquidityMonthsTenths).toBeNull();
    expect(explanation.dataQuality).toBe("low");
  });

  it("un gasto de cero tampoco da meses", () => {
    expect(
      profileFacts({ ...base, monthlyExpense: eur(0n) }).value.liquidityMonthsTenths,
    ).toBeNull();
  });

  it("sin patrimonio positivo no hay porcentajes", () => {
    const { value, explanation } = profileFacts({ ...base, total: eur(0n) });
    expect(value.riskShareBps).toBeNull();
    expect(value.stress.every((s) => s.lossShareBps === null)).toBe(true);
    expect(explanation.dataQuality).toBe("low");
  });

  it("rechaza monedas distintas sin conversión", () => {
    expect(() => profileFacts({ ...base, risk: money(1n, "USD") })).toThrow(CurrencyMismatchError);
  });
});

describe("investPathScenarios", () => {
  const input: InvestPathInput = {
    amount: eur(1_200_000n),
    months: 12,
    annualReturnBps: 700,
    dropBps: 2000,
  };
  const run = (over: Partial<InvestPathInput> = {}) => {
    const r = investPathScenarios({ ...input, ...over });
    if (!r.ok) throw new Error(r.error.code);
    return r.value;
  };
  const by = (id: string, over: Partial<InvestPathInput> = {}) => {
    const found = run(over).value.find((s) => s.id === id);
    if (!found) throw new Error(id);
    return found;
  };

  it("si el precio no se mueve, da igual cuándo se aporte", () => {
    const flat = by("flat");
    expect(flat.lump.minor).toBe(1_200_000n);
    expect(flat.periodic.minor).toBe(1_200_000n);
  });

  it("si sube de forma constante, aportar todo antes sale mejor", () => {
    const rise = by("steady_rise");
    expect(rise.lump.minor).toBeGreaterThan(rise.periodic.minor);
    expect(rise.lump.minor).toBe(1_284_000n); // 12 000 € a 7 % en doce meses
  });

  it("si baja de forma constante, aportar poco a poco sale mejor", () => {
    const fall = by("steady_fall");
    expect(fall.lump.minor).toBe(960_000n); // -20 %
    expect(fall.periodic.minor).toBeGreaterThan(fall.lump.minor);
  });

  it("si baja y se recupera, aportar poco a poco sale mejor (plan de meses impares incluido)", () => {
    for (const months of [12, 7]) {
      const dip = by("dip_and_recover", { months });
      expect(dip.lump.minor).toBe(1_200_000n); // vuelve al precio de partida
      expect(dip.periodic.minor).toBeGreaterThan(dip.lump.minor);
    }
  });

  it("explica sus supuestos y devuelve cuatro caminos", () => {
    const { value, explanation } = run();
    expect(value).toHaveLength(4);
    expect(explanation.method).toBe("invest_paths.deterministic_scenarios");
    expect(explanation.assumptions).toContain("invest_paths.scenarios_are_not_forecasts");
    expect(explanation.months).toBe(12);
  });

  it.each([
    [{ amount: eur(0n) }, "assistant.amount_invalid"],
    [{ months: 1 }, "assistant.months_invalid"],
    [{ months: 61 }, "assistant.months_invalid"],
    [{ months: 6.5 }, "assistant.months_invalid"],
    [{ annualReturnBps: 5001 }, "assistant.return_invalid"],
    [{ annualReturnBps: 1.5 }, "assistant.return_invalid"],
    [{ dropBps: -1 }, "assistant.drop_invalid"],
    [{ dropBps: 9001 }, "assistant.drop_invalid"],
  ] as const)("rechaza entradas no válidas %#", (over, code) => {
    const r = investPathScenarios({ ...input, ...over });
    expect(r).toEqual({ ok: false, error: { code } });
  });
});

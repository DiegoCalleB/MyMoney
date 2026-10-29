import { describe, expect, it } from "vitest";
import {
  concentration,
  dec,
  exposure,
  money,
  speculativeShare,
  stressScenario,
  type Exposure,
  type Holding,
} from "../../src";

const eur = (units: number) => money(BigInt(Math.round(units * 100)), "EUR");
const holding = (id: string, units: number, over: Partial<Holding> = {}): Holding => ({
  id,
  value: eur(units),
  ...over,
});
const run = (holdings: Holding[]) => {
  const r = exposure(holdings, "EUR");
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("exposure", () => {
  it("reparte por composición y deja lo no cubierto sin clasificar", () => {
    const r = run([
      holding("fondo", 1000, {
        composition: [
          { key: "equity", weightBps: 6000 },
          { key: "fixed_income", weightBps: 3000 },
        ],
      }),
    ]);
    expect(r.value.byClass.map((c) => [c.key, c.value.minor, c.shareBps])).toEqual([
      ["equity", 60000n, 6000],
      ["fixed_income", 30000n, 3000],
      ["unclassified", 10000n, 1000],
    ]);
    expect(r.explanation.quality.level).toBe("low");
    expect(r.explanation.quality.notes).toEqual([
      { code: "risk.composition_incomplete", holdingId: "fondo" },
    ]);
  });

  it("sin composición usa la clase principal y marca calidad baja; sin nada, sin clasificar", () => {
    const r = run([
      holding("a", 100, { fallbackClass: "cash", composition: [] }),
      holding("b", 50),
    ]);
    expect(r.value.byClass.map((c) => c.key)).toEqual(["cash", "unclassified"]);
    expect(r.explanation.quality.notes.map((n) => n.code)).toEqual([
      "risk.class_from_fallback",
      "risk.unclassified",
    ]);
  });

  it("una composición completa tiene calidad completa y suma exactamente el valor", () => {
    const r = run([
      holding("a", 0.01, {
        composition: [
          { key: "equity", weightBps: 3333 },
          { key: "crypto", weightBps: 3333 },
          { key: "cash", weightBps: 3334 },
        ],
      }),
    ]);
    expect(r.explanation.quality.level).toBe("complete");
    expect(r.value.total).toEqual(eur(0.01));
    expect(r.value.byClass.reduce((acc, c) => acc + c.value.minor, 0n)).toBe(1n);
  });

  it("ordena por valor y desempata por clase; ignora lo que vale cero", () => {
    const r = run([
      holding("a", 10, { fallbackClass: "equity" }),
      holding("b", 30, { fallbackClass: "cash" }),
      holding("c", 10, { fallbackClass: "commodity" }),
      holding("d", 0, { fallbackClass: "crypto" }),
    ]);
    expect(r.value.byClass.map((c) => c.key)).toEqual(["cash", "commodity", "equity"]);
    expect(r.value.byHolding.map((h) => h.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("sin nada que repartir, el total es cero", () => {
    const r = run([]);
    expect(r.value.total).toEqual(eur(0));
    expect(r.value.byClass).toEqual([]);
    expect(run([holding("a", 0)]).value.byClass).toEqual([]);
  });

  it("rechaza moneda distinta, valores negativos y composiciones inválidas", () => {
    expect(exposure([{ id: "x", value: money(1n, "USD") }], "EUR")).toEqual({
      ok: false,
      error: { code: "risk.currency_mismatch", holdingId: "x" },
    });
    expect(exposure([holding("x", -1)], "EUR")).toMatchObject({
      ok: false,
      error: { code: "risk.negative_holding" },
    });
    const bad = (composition: Holding["composition"]) =>
      exposure([holding("x", 1, composition ? { composition } : {})], "EUR");
    expect(bad([{ key: "equity", weightBps: 10_001 }])).toMatchObject({
      ok: false,
      error: { code: "risk.invalid_composition" },
    });
    expect(bad([{ key: "equity", weightBps: -1 }])).toMatchObject({ ok: false });
    expect(bad([{ key: "equity", weightBps: 1.5 }])).toMatchObject({ ok: false });
  });
});

describe("concentration", () => {
  const items = (...values: number[]) =>
    values.map((v, i) => ({ key: `k${String(i)}`, value: eur(v) }));

  it("un solo elemento lo concentra todo", () => {
    const c = concentration(items(100));
    expect(c.top).toEqual({ key: "k0", shareBps: 10_000 });
    expect(c.herfindahl.toString()).toBe("1");
    expect(c.effectiveCount?.toString()).toBe("1");
  });

  it("cuatro elementos iguales equivalen a cuatro", () => {
    const c = concentration(items(25, 25, 25, 25));
    expect(c.top?.shareBps).toBe(2500);
    expect(c.herfindahl.toString()).toBe("0.25");
    expect(c.effectiveCount?.toString()).toBe("4");
  });

  it("encuentra el mayor aunque no esté el primero ni el último, e ignora ceros", () => {
    const c = concentration(items(10, 60, 0, 30));
    expect(c.top).toEqual({ key: "k1", shareBps: 6000 });
    expect(concentration(items(60, 10)).top?.key).toBe("k0");
  });

  it("sin valor no hay concentración", () => {
    expect(concentration([])).toMatchObject({ top: null, effectiveCount: null });
    expect(concentration(items(0, 0)).top).toBeNull();
  });
});

describe("stressScenario", () => {
  const base = (): Exposure =>
    run([
      holding("fondo", 1000, { fallbackClass: "equity" }),
      holding("cripto", 200, { fallbackClass: "crypto" }),
      holding("cuenta", 800, { fallbackClass: "cash" }),
    ]).value;
  const stress = (shocks: Parameters<typeof stressScenario>[0]["shocks"], spending?: number) => {
    const r = stressScenario({
      exposure: base(),
      shocks,
      ...(spending === undefined ? {} : { monthlySpending: eur(spending) }),
    });
    if (!r.ok) throw new Error(r.error.code);
    return r.value;
  };

  it("aplica el choque a cada clase y no toca las demás", () => {
    const r = stress({ equity: dec("-0.35"), crypto: dec("-0.7") }, 1000);
    expect(r.value.byHolding).toEqual([
      { id: "fondo", impact: eur(-350) },
      { id: "cripto", impact: eur(-140) },
      { id: "cuenta", impact: eur(0) },
    ]);
    expect(r.value.total).toEqual(eur(-490));
    expect(r.value.valueAfter).toEqual(eur(1510));
    expect(r.value.monthsOfSpending?.toString()).toBe("0.49");
    expect(r.explanation.unshocked).toEqual(["cash"]);
    expect(r.explanation.assumptions).toContain("risk.stress_no_correlations");
  });

  it("sin gasto conocido, con gasto cero o sin pérdida no hay meses de gasto", () => {
    expect(stress({ equity: dec("-0.1") }).value.monthsOfSpending).toBeNull();
    expect(stress({ equity: dec("-0.1") }, 0).value.monthsOfSpending).toBeNull();
    expect(stress({ equity: dec("0.1") }, 1000).value.monthsOfSpending).toBeNull();
  });

  it("un choque de −100 % lo pierde todo y uno mayor es inválido", () => {
    expect(stress({ equity: dec("-1") }).value.total).toEqual(eur(-1000));
    expect(stressScenario({ exposure: base(), shocks: { equity: dec("-1.1") } })).toEqual({
      ok: false,
      error: { code: "risk.invalid_shock" },
    });
  });

  it("rechaza un gasto en otra moneda", () => {
    expect(
      stressScenario({
        exposure: base(),
        shocks: {},
        monthlySpending: money(1n, "USD"),
      }),
    ).toEqual({ ok: false, error: { code: "risk.currency_mismatch" } });
  });
});

describe("speculativeShare", () => {
  it("pesa lo marcado como especulativo", () => {
    const s = speculativeShare(
      [holding("a", 900), holding("b", 100, { speculative: true })],
      "EUR",
    );
    expect(s).toEqual({ value: eur(100), shareBps: 1000 });
  });

  it("sin nada es cero", () => {
    expect(speculativeShare([], "EUR")).toEqual({ value: eur(0), shareBps: 0 });
  });
});

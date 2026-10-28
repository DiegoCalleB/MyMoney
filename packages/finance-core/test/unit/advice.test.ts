import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADVICE_THRESHOLDS,
  evaluateAdvice,
  money,
  type AdviceAccount,
  type AdviceInput,
} from "../../src";

const eur = (minor: bigint) => money(minor, "EUR");
const acc = (id: string, minor: bigint, over: Partial<AdviceAccount> = {}): AdviceAccount => ({
  accountId: id,
  institutionId: null,
  kind: "fund_holding",
  value: eur(minor),
  ageDays: 1,
  stale: false,
  ...over,
});
const input = (accounts: AdviceAccount[], over: Partial<AdviceInput> = {}): AdviceInput => ({
  baseCurrency: "EUR",
  accounts,
  monthlyExpense: null,
  thresholds: DEFAULT_ADVICE_THRESHOLDS,
  ...over,
});
const ids = (i: AdviceInput) => evaluateAdvice(i).map((f) => f.messageKey);

describe("evaluateAdvice", () => {
  it("sin patrimonio positivo no avisa de concentraciones", () => {
    expect(ids(input([]))).toEqual([]);
    expect(ids(input([acc("d", -500n, { kind: "loan" })]))).toEqual([]);
  });

  it("avisa de concentración en una entidad y gradúa la severidad", () => {
    const mid = evaluateAdvice(
      input([
        acc("a", 5000n, { institutionId: "x" }),
        acc("b", 5000n, { institutionId: "y" }),
        acc("c", 1000n, { institutionId: "y" }),
      ]),
    );
    expect(mid[0]).toMatchObject({
      ruleId: "concentration_institution",
      severity: "attention",
      params: { shareBps: "5454", limitBps: "4000" },
      level: 2,
    });
    const high = evaluateAdvice(input([acc("a", 9000n, { institutionId: "x" }), acc("b", 1000n)]));
    expect(high[0]?.severity).toBe("important");
    // Repartido por debajo del umbral, o sin entidades indicadas: no avisa.
    expect(
      ids(
        input([
          acc("a", 3000n, { institutionId: "x" }),
          acc("b", 3000n, { institutionId: "y" }),
          acc("c", 4000n, { institutionId: "z" }),
        ]),
      ),
    ).toEqual([]);
    expect(ids(input([acc("a", 9000n)]))).toEqual([]);
  });

  it("informa del peso del efectivo y las cuentas de ahorro", () => {
    const f = evaluateAdvice(
      input([
        acc("a", 6000n, { kind: "savings" }),
        acc("b", 3000n, { kind: "cash" }),
        acc("c", 1000n),
      ]),
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      ruleId: "liquid_share",
      severity: "info",
      params: { shareBps: "9000" },
    });
    expect(ids(input([acc("a", 2000n, { kind: "current" }), acc("b", 8000n)]))).toEqual([]);
  });

  it("calcula los meses de colchón con el gasto indicado", () => {
    const low = evaluateAdvice(
      input([acc("a", 200_00n, { kind: "current" }), acc("b", 99_800_00n)], {
        monthlyExpense: eur(1000_00n),
      }),
    );
    const runway = low.find((f) => f.ruleId === "emergency_runway");
    expect(runway).toMatchObject({
      messageKey: "advice.runway_low",
      severity: "important",
      confidence: "medium",
      params: { months: "0.2", limitMonths: "3" },
    });
    const attention = evaluateAdvice(
      input([acc("a", 2000_00n, { kind: "current" }), acc("b", 99_000_00n)], {
        monthlyExpense: eur(1000_00n),
      }),
    ).find((f) => f.ruleId === "emergency_runway");
    expect(attention?.severity).toBe("attention");
    const high = evaluateAdvice(
      input([acc("a", 30_000_00n, { kind: "savings" })], { monthlyExpense: eur(1000_00n) }),
    ).find((f) => f.ruleId === "emergency_runway");
    expect(high).toMatchObject({
      messageKey: "advice.runway_high",
      severity: "info",
      params: { months: "30.0", limitMonths: "12" },
    });
    // Dentro del rango razonable: sin aviso de colchón.
    expect(
      evaluateAdvice(
        input([acc("a", 6000_00n, { kind: "current" }), acc("b", 50_000_00n)], {
          monthlyExpense: eur(1000_00n),
        }),
      ).some((f) => f.ruleId === "emergency_runway"),
    ).toBe(false);
  });

  it("sin gasto indicado, en otra moneda o a cero no hay aviso de colchón", () => {
    const base = [acc("a", 30_000_00n, { kind: "savings" })];
    for (const monthlyExpense of [null, money(1000_00n, "USD"), eur(0n)]) {
      expect(
        evaluateAdvice(input(base, { monthlyExpense })).some(
          (f) => f.ruleId === "emergency_runway",
        ),
      ).toBe(false);
    }
  });

  it("avisa de valores desactualizados y baja la confianza de los demás", () => {
    const f = evaluateAdvice(
      input([
        acc("a", 9000n, { institutionId: "x", stale: true, ageDays: 90 }),
        acc("b", 1000n, { stale: true }),
      ]),
    );
    expect(f.map((x) => x.ruleId)).toEqual(["concentration_institution", "stale_valuations"]);
    expect(f[0]?.confidence).toBe("low");
    expect(f[1]).toMatchObject({
      severity: "attention",
      confidence: "high",
      params: { count: "2" },
    });
    expect(f[1]?.assumptionsUsed).toEqual([]);
  });

  it("ordena por importancia", () => {
    const f = evaluateAdvice(
      input(
        [
          acc("a", 100_00n, { kind: "savings", institutionId: "x" }),
          acc("b", 100n, { stale: true }),
        ],
        { monthlyExpense: eur(1000_00n) },
      ),
    );
    expect(f.map((x) => x.severity)).toEqual(
      ["important", "important", "attention", "info"].slice(0, f.length),
    );
  });
});

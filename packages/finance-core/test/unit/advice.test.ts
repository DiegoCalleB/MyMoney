import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADVICE_THRESHOLDS,
  THRESHOLD_ASSUMPTION_KEYS,
  THRESHOLD_FIELDS,
  calendarDate,
  evaluateAdvice,
  money,
  thresholdsFrom,
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

describe("evaluateAdvice: tope especulativo y operaciones vencidas", () => {
  const pockets = (speculative: bigint, other = 0n): NonNullable<AdviceInput["pockets"]> => [
    { pocketId: "apuestas", riskLevel: "speculative", value: eur(speculative) },
    { pocketId: "largo", riskLevel: "medium", value: eur(other) },
  ];
  const base = [acc("a", 10_000n)];

  it("avisa cuando los bolsillos especulativos superan el umbral y gradúa la severidad", () => {
    const attention = evaluateAdvice(input(base, { pockets: pockets(700n) }));
    expect(attention[0]).toMatchObject({
      ruleId: "speculative_cap",
      severity: "attention",
      params: { shareBps: "700", limitBps: "500" },
      assumptionsUsed: ["speculative_share_bps"],
    });
    const important = evaluateAdvice(input(base, { pockets: pockets(1200n) }));
    expect(important[0]?.severity).toBe("important");
  });

  it("no avisa en el umbral exacto, sin bolsillos o con importes no positivos", () => {
    expect(ids(input(base, { pockets: pockets(500n) }))).not.toContain("advice.speculative_cap");
    expect(ids(input(base))).not.toContain("advice.speculative_cap");
    expect(ids(input(base, { pockets: pockets(-300n) }))).not.toContain("advice.speculative_cap");
  });

  it("el umbral lo pone la persona", () => {
    const strict = { ...DEFAULT_ADVICE_THRESHOLDS, speculativeShareBps: 100 };
    expect(ids(input(base, { pockets: pockets(200n), thresholds: strict }))).toContain(
      "advice.speculative_cap",
    );
  });

  const date = (value: string) => calendarDate(value);
  const schedule = (pending: string[], onDate = "2026-10-28") => ({
    onDate: date(onDate),
    pending: pending.map(date),
  });

  it("avisa de las operaciones planificadas con fecha pasada y cuenta el retraso", () => {
    const [finding] = evaluateAdvice(
      input([], { schedule: schedule(["2026-10-20", "2026-10-18", "2026-11-05", "2026-10-28"]) }),
    );
    expect(finding).toMatchObject({
      ruleId: "planned_operation_due",
      severity: "info",
      params: { count: "2", days: "10" },
    });
  });

  it("una operación con más de dos semanas de retraso pide atención", () => {
    const [finding] = evaluateAdvice(input([], { schedule: schedule(["2026-10-01"]) }));
    expect(finding?.severity).toBe("attention");
    const [recent] = evaluateAdvice(input([], { schedule: schedule(["2026-10-14"]) }));
    expect(recent?.severity).toBe("info");
  });

  it("sin vencidas o sin calendario no avisa", () => {
    expect(ids(input([], { schedule: schedule(["2026-10-28", "2026-12-01"]) }))).toEqual([]);
    expect(ids(input([], { schedule: schedule([]) }))).toEqual([]);
    expect(ids(input([]))).toEqual([]);
  });
});

describe("thresholdsFrom", () => {
  const row = (key: string, value: string) => ({ key, value });

  it("sin supuestos usa los valores por defecto", () => {
    expect(thresholdsFrom([])).toEqual({ thresholds: DEFAULT_ADVICE_THRESHOLDS, ignored: [] });
  });

  it("aplica los supuestos válidos (también con decimales a cero, como los devuelve la base de datos)", () => {
    const { thresholds, ignored } = thresholdsFrom([
      row("speculative_share_bps", "300.0000000000"),
      row("institution_share_bps", "2500"),
      row("liquid_share_bps", "0"),
      row("runway_min_months", "4"),
      row("runway_max_months", "24"),
    ]);
    expect(thresholds).toEqual({
      speculativeShareBps: 300,
      institutionShareBps: 2500,
      liquidShareBps: 0,
      runwayMinMonths: 4,
      runwayMaxMonths: 24,
    });
    expect(ignored).toEqual([]);
  });

  it("ignora y dice lo que no es entero o está fuera de rango", () => {
    const { thresholds, ignored } = thresholdsFrom([
      row("speculative_share_bps", "12.5"),
      row("institution_share_bps", "10001"),
      row("liquid_share_bps", "-1"),
      row("runway_max_months", "abc"),
      row("otra_cosa", "5"),
    ]);
    expect(thresholds).toEqual(DEFAULT_ADVICE_THRESHOLDS);
    expect(ignored).toEqual([
      "speculative_share_bps",
      "institution_share_bps",
      "liquid_share_bps",
      "runway_max_months",
    ]);
  });

  it("un mínimo de meses que no es menor que el máximo se ignora junto con su pareja", () => {
    const { thresholds, ignored } = thresholdsFrom([
      row("runway_min_months", "12"),
      row("runway_max_months", "6"),
    ]);
    expect(thresholds.runwayMinMonths).toBe(DEFAULT_ADVICE_THRESHOLDS.runwayMinMonths);
    expect(thresholds.runwayMaxMonths).toBe(DEFAULT_ADVICE_THRESHOLDS.runwayMaxMonths);
    expect(ignored).toEqual(["runway_min_months", "runway_max_months"]);
  });

  it("las claves y rangos están descritos para la interfaz", () => {
    expect(THRESHOLD_ASSUMPTION_KEYS).toEqual([
      "speculative_share_bps",
      "institution_share_bps",
      "liquid_share_bps",
      "runway_min_months",
      "runway_max_months",
    ]);
    expect(THRESHOLD_FIELDS.liquidShareBps).toMatchObject({ unit: "bps", min: 0, max: 10_000 });
  });
});

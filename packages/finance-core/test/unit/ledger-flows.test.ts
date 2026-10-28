import { describe, expect, it } from "vitest";
import {
  calendarDate,
  dec,
  externalFlows,
  money,
  valueSeries,
  type ExternalFlow,
  type FxRate,
  type LedgerLeg,
  type ValuePoint,
} from "../../src";

const d = calendarDate;
const eur = (minor: number) => money(BigInt(minor), "EUR");
const usd = (minor: number) => money(BigInt(minor), "USD");
const usdRate: FxRate = {
  base: "EUR",
  quote: "USD",
  asOf: d("2026-01-01"),
  rate: dec("2"),
  source: "BCE",
};

let n = 0;
const tx = (
  kind: string,
  date: string,
  legs: [LedgerLeg["role"], string | null, ReturnType<typeof eur>][],
): LedgerLeg[] => {
  n += 1;
  return legs.map(([role, accountId, amount]) => ({
    transactionId: `tx-${String(n)}`,
    date: d(date),
    kind,
    role,
    accountId,
    amount,
  }));
};
const scoped = (legs: LedgerLeg[], scope: string[]) =>
  externalFlows({ legs, scope, currency: "EUR", fxRates: [usdRate] });

describe("externalFlows", () => {
  it("una aportación entra y una retirada sale", () => {
    const legs = [
      ...tx("contribution", "2026-02-01", [
        ["external", null, eur(-100_00)],
        ["cash", "fondo", eur(100_00)],
      ]),
      ...tx("withdrawal", "2026-03-01", [
        ["cash", "fondo", eur(-30_00)],
        ["external", null, eur(30_00)],
      ]),
    ];
    const r = scoped(legs, ["fondo"]);
    expect(r.value).toEqual([
      { date: d("2026-02-01"), amount: eur(100_00) },
      { date: d("2026-03-01"), amount: eur(-30_00) },
    ]);
    expect(r.explanation.quality.level).toBe("complete");
  });

  it("un traspaso entre dos cuentas del ámbito no es flujo; hacia fuera del ámbito, sí", () => {
    const legs = tx("internal_transfer", "2026-02-01", [
      ["cash", "corriente", eur(-50_00)],
      ["cash", "fondo", eur(50_00)],
    ]);
    expect(scoped(legs, ["corriente", "fondo"]).value).toEqual([]);
    expect(scoped(legs, ["fondo"]).value).toEqual([{ date: d("2026-02-01"), amount: eur(50_00) }]);
    expect(scoped(legs, ["corriente"]).value).toEqual([
      { date: d("2026-02-01"), amount: eur(-50_00) },
    ]);
  });

  it("compras, ventas y comisiones dentro de la cuenta no son flujo", () => {
    const legs = [
      ...tx("buy", "2026-02-01", [
        ["cash", "broker", eur(-1005_00)],
        ["position", "broker", eur(1000_00)],
        ["fee", null, eur(5_00)],
      ]),
      ...tx("fee", "2026-02-02", [
        ["cash", "broker", eur(-2_00)],
        ["fee", null, eur(2_00)],
      ]),
    ];
    expect(scoped(legs, ["broker"]).value).toEqual([]);
  });

  it("dividendos e intereses son rendimiento, no aportaciones", () => {
    const legs = [
      ...tx("dividend", "2026-02-01", [
        ["external", null, eur(-10_00)],
        ["cash", "broker", eur(10_00)],
      ]),
      ...tx("interest", "2026-02-02", [
        ["external", null, eur(-3_00)],
        ["cash", "broker", eur(3_00)],
      ]),
    ];
    expect(scoped(legs, ["broker"]).value).toEqual([]);
  });

  it("ignora los movimientos que no tocan el ámbito", () => {
    const legs = tx("contribution", "2026-02-01", [
      ["external", null, eur(-10_00)],
      ["cash", "otra", eur(10_00)],
    ]);
    expect(scoped(legs, ["fondo"]).value).toEqual([]);
  });

  it("convierte a la moneda pedida con el tipo de la fecha del movimiento", () => {
    const legs = tx("contribution", "2026-02-01", [
      ["external", null, usd(-200_00)],
      ["cash", "usd", usd(200_00)],
    ]);
    expect(scoped(legs, ["usd"]).value).toEqual([{ date: d("2026-02-01"), amount: eur(100_00) }]);
    const same = externalFlows({ legs, scope: ["usd"], currency: "USD", fxRates: [] });
    expect(same.value).toEqual([{ date: d("2026-02-01"), amount: usd(200_00) }]);
  });

  it("si falta el tipo de cambio, no inventa el flujo y lo declara", () => {
    const legs = tx("contribution", "2026-02-01", [
      ["external", null, money(-100n, "GBP")],
      ["cash", "gbp", money(100n, "GBP")],
    ]);
    const r = scoped(legs, ["gbp"]);
    expect(r.value).toEqual([]);
    expect(r.explanation.quality.level).toBe("partial");
    expect(r.explanation.skipped[0]?.code).toBe("fx.rate_not_found");
  });

  it("una compra de fondo pagada desde otra cuenta es una aportación al fondo", () => {
    const legs = tx("buy", "2026-02-01", [
      ["cash", "corriente", eur(-100_00)],
      ["position", "fondo", eur(100_00)],
    ]);
    expect(scoped(legs, ["fondo"]).value).toEqual([{ date: d("2026-02-01"), amount: eur(100_00) }]);
  });

  it("suma varias patas externas de la misma moneda y trata una pata sin cuenta como ajena", () => {
    const legs = tx("expense", "2026-02-01", [
      ["cash", null, eur(5_00)],
      ["cash", "fondo", eur(-30_00)],
      ["external", null, eur(10_00)],
      ["external", null, eur(15_00)],
    ]);
    expect(scoped(legs, ["fondo"]).value).toEqual([{ date: d("2026-02-01"), amount: eur(-30_00) }]);
  });

  it("ordena por fecha", () => {
    const legs = [
      ...tx("contribution", "2026-05-01", [
        ["external", null, eur(-1_00)],
        ["cash", "f", eur(1_00)],
      ]),
      ...tx("contribution", "2026-02-01", [
        ["external", null, eur(-2_00)],
        ["cash", "f", eur(2_00)],
      ]),
    ];
    expect(scoped(legs, ["f"]).value.map((f) => f.date)).toEqual([
      d("2026-02-01"),
      d("2026-05-01"),
    ]);
  });
});

const v = (date: string, minor: number): ValuePoint => ({ date: d(date), value: eur(minor) });
const f = (date: string, minor: number): ExternalFlow => ({ date: d(date), amount: eur(minor) });

describe("valueSeries", () => {
  it("suma la última valoración de cada cuenta en cada fecha", () => {
    const r = valueSeries({
      currency: "EUR",
      fxRates: [],
      accounts: [
        { accountId: "a", valuations: [v("2026-03-31", 1200), v("2026-01-31", 1000)], flows: [] },
        { accountId: "b", valuations: [v("2026-02-28", 500)], flows: [] },
      ],
    });
    expect(r.value).toEqual([v("2026-01-31", 1000), v("2026-02-28", 1500), v("2026-03-31", 1700)]);
    expect(r.explanation.quality.level).toBe("complete");
  });

  it("suma a la última valoración los flujos posteriores a ella", () => {
    const r = valueSeries({
      currency: "EUR",
      fxRates: [],
      accounts: [
        {
          accountId: "a",
          valuations: [v("2026-01-31", 1000)],
          flows: [f("2026-01-31", 50), f("2026-02-15", 200)],
        },
        { accountId: "b", valuations: [v("2026-03-31", 410)], flows: [] },
      ],
    });
    // La aportación del 31-ene ya está en esa valoración; la del 15-feb se suma después.
    expect(r.value).toEqual([v("2026-01-31", 1000), v("2026-03-31", 1610)]);
    expect(r.explanation.quality.level).toBe("complete");
    expect(r.explanation.notes).toEqual([]);
  });

  it("avisa cuando una cuenta con flujos aún no tiene valoración", () => {
    const r = valueSeries({
      currency: "EUR",
      fxRates: [],
      accounts: [
        {
          accountId: "a",
          valuations: [v("2026-01-31", 1000), v("2026-02-28", 1000), v("2026-04-30", 1000)],
          flows: [],
        },
        {
          accountId: "b",
          valuations: [v("2026-04-30", 410)],
          flows: [f("2026-01-20", 400), f("2026-02-10", 0)],
        },
      ],
    });
    expect(r.value[0]).toEqual(v("2026-01-31", 1400));
    expect(r.explanation.quality.level).toBe("approximate");
    expect(r.explanation.notes).toEqual([
      { code: "returns.series_cost_basis_used", params: { accountId: "b", date: "2026-01-31" } },
    ]);
  });

  it("convierte las cuentas en otra moneda y marca como parcial si falta el tipo", () => {
    const accounts = [
      { accountId: "a", valuations: [v("2026-01-31", 1000)], flows: [] },
      { accountId: "u", valuations: [{ date: d("2026-01-31"), value: usd(400) }], flows: [] },
    ];
    const ok = valueSeries({ currency: "EUR", fxRates: [usdRate], accounts });
    expect(ok.value).toEqual([v("2026-01-31", 1200)]);
    const missing = valueSeries({ currency: "EUR", fxRates: [], accounts });
    expect(missing.value).toEqual([v("2026-01-31", 1000)]);
    expect(missing.explanation.quality.level).toBe("partial");
    expect(missing.explanation.notes[0]?.code).toBe("returns.series_fx_missing");
  });

  it("sin valoraciones no hay serie", () => {
    expect(valueSeries({ currency: "EUR", fxRates: [], accounts: [] }).value).toEqual([]);
  });
});

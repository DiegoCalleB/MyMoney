import {
  calendarDate,
  cpiPoint,
  dec,
  money,
  type FxRate,
  type LedgerLeg,
} from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { accountRow, valuationRow } from "@/server/home-model";
import {
  buildReturns,
  cpiPoints,
  cpiRow,
  legRow,
  summarize,
  type ReturnsRows,
} from "@/server/returns-model";

const d = calendarDate;
const today = d("2027-01-01");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const space = { id: ID(1), name: "Casa", base_currency: "EUR", timezone: "Europe/Madrid" } as const;

const account = (n: number, over: Record<string, unknown> = {}) =>
  accountRow.parse({
    id: ID(n),
    name: `Cuenta ${String(n)}`,
    kind: "fund_holding",
    is_liability: false,
    currency: "EUR",
    scope: "household",
    closed_on: null,
    institution_id: null,
    ...over,
  });
const valuation = (n: number, asOf: string, units: number, currency = "EUR") =>
  valuationRow.parse({ account_id: ID(n), as_of: asOf, value_minor: units * 100, currency });

let tx = 0;
const contribution = (n: number, date: string, units: number): LedgerLeg[] => {
  tx += 1;
  const base = {
    transactionId: `t${String(tx)}`,
    date: d(date),
    kind: units > 0 ? "contribution" : "withdrawal",
  };
  return [
    { ...base, role: "external", accountId: null, amount: money(BigInt(-units * 100), "EUR") },
    { ...base, role: "cash", accountId: ID(n), amount: money(BigInt(units * 100), "EUR") },
  ];
};

const rows = (over: Partial<ReturnsRows> = {}): ReturnsRows => ({
  space: { ...space },
  accounts: [],
  valuations: [],
  legs: [],
  fxRates: [],
  cpi: [],
  ...over,
});

describe("summarize", () => {
  const v = (date: string, units: number) => ({
    date: d(date),
    value: money(BigInt(units * 100), "EUR"),
  });
  const f = (date: string, units: number) => ({
    date: d(date),
    amount: money(BigInt(units * 100), "EUR"),
  });

  it("sin valoraciones no hay resumen", () => {
    expect(summarize([], [], [])).toBeNull();
  });

  it("si la aportación es anterior a la primera valoración, el periodo arranca en ella", () => {
    const s = summarize(
      [v("2026-07-01", 1050), v("2027-01-01", 1100)],
      [f("2026-01-01", 1000)],
      [],
    );
    expect(s?.from).toBe("2026-01-01");
    expect(s?.gain.ok && s.gain.result.value.gain).toEqual(money(10000n, "EUR"));
    expect(s?.xirr.ok).toBe(true);
    expect(s?.twr.ok).toBe(true);
  });

  it("sin aportaciones, la primera valoración es el capital inicial y la real avisa de que falta el IPC", () => {
    const s = summarize([v("2026-01-01", 1000), v("2027-01-01", 1100)], [], []);
    expect(s?.from).toBe("2026-01-01");
    expect(s?.xirr.ok && s.xirr.result.value.annualized.minus("0.1").abs().lt("1e-9")).toBe(true);
    expect(s?.real).toMatchObject({ ok: false, code: "returns.cpi_not_available" });
    expect(s?.real.basis).toBe("twr");
  });

  it("calcula la real con el IPC y, si la TWR falla, se apoya en la XIRR", () => {
    const cpi = [cpiPoint("2026-12", "100"), cpiPoint("2027-01", "102")];
    const withTwr = summarize([v("2026-12-01", 1000), v("2027-01-01", 1100)], [], cpi);
    expect(
      withTwr?.real.ok &&
        withTwr.real.result.value.cumulative.inflation.minus("0.02").abs().lt("1e-9"),
    ).toBe(true);

    const oneValuation = summarize([v("2027-01-01", 1100)], [f("2026-12-01", 1000)], cpi);
    expect(oneValuation?.twr.ok).toBe(false);
    expect(oneValuation?.real.basis).toBe("xirr");
    expect(oneValuation?.real.ok).toBe(true);
  });

  it("si no hay ninguna rentabilidad nominal, la real lo dice", () => {
    const s = summarize([v("2027-01-01", 1100)], [], []);
    expect(s?.real).toMatchObject({ ok: false, code: "returns.no_nominal_return" });
  });

  it("ignora los flujos posteriores a la última valoración", () => {
    const s = summarize([v("2026-01-01", 1000), v("2026-07-01", 1050)], [f("2026-12-01", 500)], []);
    expect(s?.gain.ok && s.gain.result.value.contributed).toEqual(money(0n, "EUR"));
  });
});

describe("buildReturns", () => {
  it("solo calcula cuentas de inversión del hogar, no corrientes ni deudas", () => {
    const model = buildReturns(
      rows({
        accounts: [
          account(2),
          account(3, { kind: "current" }),
          account(4, { kind: "mortgage", is_liability: true }),
          account(5, { scope: "external" }),
        ],
        valuations: [valuation(2, "2026-01-01", 1000), valuation(3, "2026-01-01", 5)],
      }),
      today,
    );
    expect(model.accounts.map((a) => a.accountId)).toEqual([ID(2)]);
    expect([...model.meta.keys()]).toEqual([ID(2)]);
    expect(model.total).toBeNull();
  });

  it("calcula el conjunto cuando hay dos cuentas valoradas y un traspaso entre ellas no es aportación", () => {
    const transfer: LedgerLeg[] = [
      {
        transactionId: "tr",
        date: d("2026-07-01"),
        kind: "internal_transfer",
        role: "cash",
        accountId: ID(2),
        amount: money(-20000n, "EUR"),
      },
      {
        transactionId: "tr",
        date: d("2026-07-01"),
        kind: "internal_transfer",
        role: "cash",
        accountId: ID(3),
        amount: money(20000n, "EUR"),
      },
    ];
    const model = buildReturns(
      rows({
        accounts: [account(2), account(3, { kind: "brokerage" })],
        legs: [
          ...contribution(2, "2026-01-01", 1000),
          ...contribution(3, "2026-01-01", 500),
          ...transfer,
        ],
        valuations: [
          valuation(2, "2026-01-01", 1000),
          valuation(3, "2026-01-01", 500),
          valuation(2, "2027-01-01", 880),
          valuation(3, "2027-01-01", 720),
        ],
      }),
      today,
    );
    expect(model.accounts).toHaveLength(2);
    const total = model.total;
    expect(total?.gain.ok && total.gain.result.value.opening).toEqual(money(150000n, "EUR"));
    expect(total?.gain.ok && total.gain.result.value.gain).toEqual(money(10000n, "EUR"));
    // Por cuenta, el traspaso sí es retirada de una y aportación de la otra.
    const first = model.accounts.find((a) => a.accountId === ID(2));
    expect(first?.summary.gain.ok && first.summary.gain.result.value.withdrawn).toEqual(
      money(20000n, "EUR"),
    );
  });

  it("descarta las valoraciones en otra moneda que la de la cuenta y las posteriores a hoy", () => {
    const model = buildReturns(
      rows({
        accounts: [account(2)],
        valuations: [
          valuation(2, "2026-01-01", 1000),
          valuation(2, "2026-06-01", 9, "USD"),
          valuation(2, "2027-06-01", 9999),
        ],
      }),
      today,
    );
    expect(model.accounts[0]?.summary.to).toBe("2026-01-01");
  });

  it("avisa de los movimientos que no se pudieron convertir", () => {
    const fx: FxRate[] = [];
    const gbp: LedgerLeg[] = [
      {
        transactionId: "g",
        date: d("2026-02-01"),
        kind: "contribution",
        role: "external",
        accountId: null,
        amount: money(-100n, "GBP"),
      },
      {
        transactionId: "g",
        date: d("2026-02-01"),
        kind: "contribution",
        role: "cash",
        accountId: ID(2),
        amount: money(100n, "GBP"),
      },
    ];
    const model = buildReturns(
      rows({
        accounts: [account(2), account(3)],
        legs: gbp,
        fxRates: fx,
        valuations: [valuation(2, "2026-01-01", 10), valuation(3, "2026-01-01", 10)],
      }),
      today,
    );
    expect(model.accounts[0]?.summary.notes).toEqual([
      { code: "fx.rate_not_found", params: { from: "GBP", to: "EUR", onDate: "2026-02-01" } },
    ]);
    expect(model.total?.notes.length).toBeGreaterThan(0);
  });
});

describe("filas de la base de datos", () => {
  it("lee una pata y la convierte al dominio", () => {
    const leg = legRow.parse({
      leg_id: ID(9),
      transaction_id: ID(8),
      occurred_on: "2026-02-01",
      kind: "contribution",
      role: "cash",
      account_id: ID(2),
      currency: "EUR",
      amount_minor: 12345,
    });
    expect(leg).toEqual({
      transactionId: ID(8),
      date: "2026-02-01",
      kind: "contribution",
      role: "cash",
      accountId: ID(2),
      amount: money(12345n, "EUR"),
    });
  });

  it("rechaza monedas, fechas o roles inválidos", () => {
    const base = {
      leg_id: ID(9),
      transaction_id: ID(8),
      occurred_on: "2026-02-01",
      kind: "x",
      role: "cash",
      account_id: null,
      currency: "EUR",
      amount_minor: 1,
    };
    expect(legRow.safeParse({ ...base, currency: "XXX" }).success).toBe(false);
    expect(legRow.safeParse({ ...base, occurred_on: "2026-13-01" }).success).toBe(false);
    expect(legRow.safeParse({ ...base, role: "otro" }).success).toBe(false);
  });

  it("convierte el IPC en puntos mensuales", () => {
    const points = cpiPoints([cpiRow.parse({ period: "2026-08-01", index_value: "114.2350" })]);
    expect(points).toEqual([{ month: "2026-08", index: dec("114.235") }]);
  });
});

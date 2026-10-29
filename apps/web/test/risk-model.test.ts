import { calendarDate, money, netWorth, type AccountInput } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import type { AccountMeta } from "@/server/home-model";
import {
  SCENARIOS,
  averageMonthlySpending,
  buildRisk,
  cashflowRow,
  compositionRow,
  defaultClass,
  spendingWindow,
} from "@/server/risk-model";

const today = calendarDate("2026-10-28");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const eur = (units: number) => money(BigInt(units * 100), "EUR");

const account = (n: number, units: number, isLiability = false): AccountInput => ({
  accountId: ID(n),
  isLiability,
  valuation: { amount: eur(units), asOf: today },
});
const meta = (kind: AccountMeta["kind"], name = kind): AccountMeta => ({
  name,
  kind,
  institutionId: null,
});
const model = (
  accounts: AccountInput[],
  kinds: AccountMeta[],
  extra: Partial<Parameters<typeof buildRisk>[0]> = {},
) =>
  buildRisk({
    netWorth: netWorth({
      baseCurrency: "EUR",
      onDate: today,
      accounts,
      allocations: [],
      fxRates: [],
    }),
    accounts: new Map(kinds.map((k, i) => [ID(i + 1), k])),
    compositions: [],
    cashflow: [],
    ...extra,
  });

describe("defaultClass", () => {
  it("asigna una clase evidente y deja mixtos y sin clase los demás", () => {
    expect(defaultClass("current")).toBe("cash");
    expect(defaultClass("deposit")).toBe("cash");
    expect(defaultClass("crypto")).toBe("crypto");
    expect(defaultClass("real_estate")).toBe("real_estate");
    expect(defaultClass("fund_holding")).toBe("mixed");
    expect(defaultClass("brokerage")).toBe("mixed");
    expect(defaultClass("vehicle")).toBeUndefined();
  });
});

describe("spendingWindow y gasto medio", () => {
  it("toma los tres meses completos anteriores al actual", () => {
    expect(spendingWindow(calendarDate("2026-10-28"))).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
    expect(spendingWindow(calendarDate("2027-01-05"))).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
  });

  it("promedia los meses con gasto en la moneda base", () => {
    const rows = [
      { month: "2026-07-01", currency: "EUR", income_minor: 0, expense_minor: 100000 },
      { month: "2026-08-01", currency: "EUR", income_minor: 0, expense_minor: 200001 },
      { month: "2026-09-01", currency: "USD", income_minor: 0, expense_minor: 999 },
      { month: "2026-06-01", currency: "EUR", income_minor: 0, expense_minor: 0 },
    ].map((r) => cashflowRow.parse(r));
    expect(averageMonthlySpending(rows, "EUR")).toEqual(money(150001n, "EUR"));
    expect(averageMonthlySpending([], "EUR")).toBeNull();
  });
});

describe("buildRisk", () => {
  it("reparte por tipo de cuenta, ignora deudas y calcula concentración", () => {
    const risk = model(
      [account(1, 800), account(2, 1000), account(3, 200), account(4, 5000, true)],
      [meta("current"), meta("fund_holding"), meta("crypto"), meta("mortgage")],
    );
    expect(risk.exposure?.value.byClass.map((c) => [c.key, c.shareBps])).toEqual([
      ["mixed", 5000],
      ["cash", 4000],
      ["crypto", 1000],
    ]);
    expect(risk.exposure?.explanation.quality.level).toBe("low");
    expect(risk.byAccount.top).toEqual({ key: ID(2), shareBps: 5000 });
    expect(risk.speculative.shareBps).toBe(1000);
    expect(risk.editable).toEqual([ID(2)]);
    expect(risk.names.get(ID(2))).toBe("fund_holding");
  });

  it("el reparto manual sustituye al valor por defecto", () => {
    const risk = model([account(1, 1000)], [meta("fund_holding")], {
      compositions: [
        compositionRow.parse({ account_id: ID(1), asset_class: "equity", weight_bps: 7000 }),
        compositionRow.parse({ account_id: ID(1), asset_class: "fixed_income", weight_bps: 3000 }),
      ],
    });
    expect(risk.exposure?.value.byClass.map((c) => [c.key, c.shareBps])).toEqual([
      ["equity", 7000],
      ["fixed_income", 3000],
    ]);
    expect(risk.exposure?.explanation.quality.level).toBe("complete");
  });

  it("calcula los tres escenarios y los meses de gasto", () => {
    const risk = model([account(1, 1000), account(2, 500)], [meta("brokerage"), meta("current")], {
      compositions: [
        compositionRow.parse({ account_id: ID(1), asset_class: "equity", weight_bps: 10000 }),
      ],
      cashflow: [
        cashflowRow.parse({
          month: "2026-09-01",
          currency: "EUR",
          income_minor: 0,
          expense_minor: 100000,
        }),
      ],
    });
    expect(risk.scenarios.map((s) => s.id)).toEqual(SCENARIOS.map((s) => s.id));
    const strong = risk.scenarios.find((s) => s.id === "strong");
    expect(strong?.result?.value.total).toEqual(eur(-350));
    expect(strong?.result?.value.monthsOfSpending?.toString()).toBe("0.35");
    expect(risk.monthlySpending).toEqual(eur(1000));
  });

  it("sin cuentas, la exposición está vacía y no hay concentración", () => {
    const risk = model([], []);
    expect(risk.exposure?.value.total).toEqual(eur(0));
    expect(risk.byAccount.top).toBeNull();
    expect(risk.scenarios.every((s) => s.result?.value.total.minor === 0n)).toBe(true);
  });

  it("una composición inválida deja la exposición en blanco en lugar de inventarla", () => {
    const risk = model([account(1, 100)], [meta("brokerage")], {
      compositions: [
        compositionRow.parse({ account_id: ID(1), asset_class: "equity", weight_bps: 9000 }),
        compositionRow.parse({ account_id: ID(1), asset_class: "cash", weight_bps: 9000 }),
      ],
    });
    expect(risk.exposure).toBeNull();
    expect(risk.scenarios.every((s) => s.result === null)).toBe(true);
  });
});

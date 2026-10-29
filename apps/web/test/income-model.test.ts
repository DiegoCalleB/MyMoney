import { calendarDate, money } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { incomeEventRow } from "@/server/home-model";
import { buildIncome } from "@/server/income-model";

const today = calendarDate("2026-10-28");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (
  n: number,
  on: string,
  kind: "dividend" | "interest",
  minor: number,
  currency = "EUR",
) =>
  incomeEventRow.parse({ account_id: ID(n), occurred_on: on, kind, currency, amount_minor: minor });

describe("buildIncome", () => {
  const accounts = new Set([ID(1), ID(2)]);

  it("sin cobros en la moneda base no hay calendario", () => {
    expect(buildIncome([], accounts, "EUR", null, today, 12)).toBeNull();
    expect(
      buildIncome([row(1, "2026-10-01", "dividend", 100, "USD")], accounts, "EUR", null, today, 12),
    ).toBeNull();
  });

  it("suma los cobros de las cuentas indicadas y calcula la rentabilidad por cobros", () => {
    const model = buildIncome(
      [
        row(1, "2026-10-01", "dividend", 100_00),
        row(2, "2026-09-15", "interest", 50_00),
        row(3, "2026-09-15", "interest", 999_00), // cuenta que no cuenta
      ],
      accounts,
      "EUR",
      money(10_000_00n, "EUR"),
      today,
      12,
    );
    expect(model?.result.value.trailingYear).toEqual(money(150_00n, "EUR"));
    expect(model?.result.value.trailingYield?.toFixed(4)).toBe("0.0150");
    expect(model?.ignored).toBe(0);
  });

  it("deja fuera y cuenta los cobros en otra moneda", () => {
    const model = buildIncome(
      [row(1, "2026-10-01", "dividend", 100_00), row(1, "2026-10-02", "dividend", 5_00, "USD")],
      accounts,
      "EUR",
      null,
      today,
      12,
    );
    expect(model?.result.value.trailingYear).toEqual(money(100_00n, "EUR"));
    expect(model?.ignored).toBe(1);
  });

  it("un número de meses no válido es un error de programación", () => {
    expect(() =>
      buildIncome([row(1, "2026-10-01", "dividend", 1)], accounts, "EUR", null, today, 0),
    ).toThrow("income.months_invalid");
  });
});

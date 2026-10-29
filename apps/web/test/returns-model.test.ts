import { calendarDate, money, type AccountLine } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { externalFlowRow } from "@/server/home-model";
import { buildReturns } from "@/server/returns-model";

const today = calendarDate("2026-10-27");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const flow = (n: number, on: string, minor: number, currency = "EUR") =>
  externalFlowRow.parse({ account_id: ID(n), occurred_on: on, currency, amount_minor: minor });
const line = (n: number, minor: bigint, currency: "EUR" | "USD" = "EUR"): AccountLine => ({
  accountId: ID(n),
  basis: "valuation",
  asOf: today,
  original: money(minor, currency),
  shareBps: 10000,
  contribution: money(minor, currency),
  fx: { method: "identity", effectiveRate: "1", rates: [], staleDays: 0 },
  ageDays: 0,
  stale: false,
});
const info = (currency: "EUR" | "USD" = "EUR", isLiability = false) => ({ currency, isLiability });

describe("buildReturns", () => {
  it("calcula por cuenta y el total de las cuentas en moneda base", () => {
    const model = buildReturns(
      [flow(1, "2024-10-27", 100_00), flow(2, "2024-10-27", 200_00)],
      [line(1, 121_00n), line(2, 220_00n)],
      new Map([
        [ID(1), info()],
        [ID(2), info()],
      ]),
      "EUR",
      today,
    );
    expect(model.accounts.map((a) => a.result.value.gain.minor)).toEqual([21_00n, 20_00n]);
    expect(model.total?.value.contributed.minor).toBe(300_00n);
    expect(model.total?.value.gain.minor).toBe(41_00n);
  });

  it("ignora deudas, cuentas sin flujos, flujos en otra moneda y flujos sin valor", () => {
    const model = buildReturns(
      [
        flow(1, "2024-10-27", 100_00),
        flow(3, "2024-10-27", 100_00, "USD"),
        flow(9, "2024-10-27", 5_00),
      ],
      [line(1, 110_00n), line(2, 50_00n), line(3, 120_00n), line(4, 1_00n)],
      new Map([
        [ID(1), info("EUR", true)],
        [ID(2), info()],
        [ID(3), info()],
        [ID(4), info()],
      ]),
      "EUR",
      today,
    );
    expect(model.accounts).toEqual([]);
    expect(model.total).toBeNull();
  });

  it("sin total cuando solo hay una cuenta en moneda base, y descarta flujos futuros", () => {
    const model = buildReturns(
      [flow(1, "2024-10-27", 100_00), flow(2, "2030-01-01", 100_00)],
      [line(1, 110_00n), line(2, 100_00n), line(5, 10_00n, "USD")],
      new Map([
        [ID(1), info()],
        [ID(2), info()],
        [ID(5), info("USD")],
      ]),
      "EUR",
      today,
    );
    expect(model.accounts).toHaveLength(1);
    expect(model.total).toBeNull();
  });

  it("no incluye cuentas sin metadatos", () => {
    expect(
      buildReturns([flow(1, "2024-10-27", 1)], [line(1, 1n)], new Map(), "EUR", today).accounts,
    ).toEqual([]);
  });
});

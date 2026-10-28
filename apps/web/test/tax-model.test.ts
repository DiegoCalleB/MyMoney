import { calendarDate } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { externalFlowRow } from "@/server/home-model";
import {
  contributedInYear,
  netContributed,
  parsePercentToBps,
  pensionLimitFrom,
  savingsScaleFrom,
  taxParameterRow,
} from "@/server/tax-model";

const row = (key: string, value: unknown) =>
  taxParameterRow.parse({
    key,
    fiscal_year: 2026,
    value,
    source_url: "https://example.test/fuente",
    verified_on: "2026-10-28",
  });
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const flow = (n: number, on: string, minor: number, currency = "EUR") =>
  externalFlowRow.parse({ account_id: ID(n), occurred_on: on, currency, amount_minor: minor });

describe("pensionLimitFrom", () => {
  it("lee el límite con su fuente", () => {
    const r = pensionLimitFrom([
      row("pension_individual_limit", { amount_minor: 150000, currency: "EUR" }),
    ]);
    expect(r?.limit).toEqual({ minor: 150000n, currency: "EUR" });
    expect(r?.source).toEqual({
      fiscalYear: 2026,
      sourceUrl: "https://example.test/fuente",
      verifiedOn: "2026-10-28",
    });
  });

  it("acepta el importe como texto y rechaza lo que no encaja", () => {
    expect(
      pensionLimitFrom([
        row("pension_individual_limit", { amount_minor: "150000", currency: "EUR" }),
      ])?.limit.minor,
    ).toBe(150000n);
    for (const value of [
      { amount_minor: -1, currency: "EUR" },
      { amount_minor: 1.5, currency: "EUR" },
      { amount_minor: "1e5", currency: "EUR" },
      { amount_minor: 100, currency: "XXX" },
      { amount_minor: 100 },
      "texto",
      null,
    ]) {
      expect(pensionLimitFrom([row("pension_individual_limit", value)])).toBeNull();
    }
    expect(pensionLimitFrom([])).toBeNull();
    expect(pensionLimitFrom([row("otra_clave", { amount_minor: 1, currency: "EUR" })])).toBeNull();
  });
});

describe("savingsScaleFrom", () => {
  const scale = {
    currency: "EUR",
    brackets: [
      { up_to_minor: 600000, rate: "0.19" },
      { up_to_minor: "5000000", rate: "0.21" },
      { up_to_minor: null, rate: "0.28" },
    ],
  };

  it("lee los tramos con sus tipos como decimales exactos", () => {
    const r = savingsScaleFrom([row("savings_brackets", scale)]);
    expect(r?.brackets.map((b) => b.upTo?.minor ?? null)).toEqual([600000n, 5000000n, null]);
    expect(r?.brackets.map((b) => b.rate.toString())).toEqual(["0.19", "0.21", "0.28"]);
    expect(r?.currency).toBe("EUR");
  });

  it("rechaza tipos como número, fuera de 0-1 o mal escritos, y escalas vacías", () => {
    const bad = [
      { ...scale, brackets: [{ up_to_minor: null, rate: 0.19 }] },
      { ...scale, brackets: [{ up_to_minor: null, rate: "1.5" }] },
      { ...scale, brackets: [{ up_to_minor: null, rate: "-0.1" }] },
      { ...scale, brackets: [{ up_to_minor: null, rate: "19%" }] },
      { ...scale, brackets: [] },
      { ...scale, currency: "XXX" },
      { brackets: scale.brackets },
    ];
    for (const value of bad) expect(savingsScaleFrom([row("savings_brackets", value)])).toBeNull();
    expect(savingsScaleFrom([])).toBeNull();
    expect(
      savingsScaleFrom([
        row("savings_brackets", { ...scale, brackets: [{ up_to_minor: null, rate: "1" }] }),
      ])?.brackets[0]?.rate.toString(),
    ).toBe("1");
  });
});

describe("aportaciones", () => {
  const today = calendarDate("2026-10-28");
  const accounts = new Set([ID(1), ID(2)]);

  it("suma solo entradas del ejercicio, de las cuentas pedidas y de esa moneda", () => {
    const flows = [
      flow(1, "2026-01-01", 100_00),
      flow(1, "2026-06-01", 50_00),
      flow(2, "2026-03-01", 25_00),
      flow(1, "2025-12-31", 999_00), // ejercicio anterior
      flow(1, "2026-05-01", -40_00), // retirada: no resta
      flow(3, "2026-02-01", 777_00), // otra cuenta
      flow(1, "2026-02-01", 5_00, "USD"), // otra moneda
      flow(1, "2026-12-01", 888_00), // futuro
    ];
    expect(contributedInYear(flows, accounts, today, "EUR")).toEqual({
      minor: 175_00n,
      currency: "EUR",
    });
    expect(contributedInYear([], accounts, today, "EUR").minor).toBe(0n);
  });

  it("el aportado neto resta las retiradas", () => {
    const flows = [
      flow(1, "2024-01-01", 100_00),
      flow(1, "2025-01-01", -30_00),
      flow(2, "2025-01-01", 5_00),
    ];
    expect(netContributed(flows, ID(1), "EUR")).toEqual({ minor: 70_00n, currency: "EUR" });
  });
});

describe("parsePercentToBps", () => {
  it.each([
    ["1,5", 150],
    ["0.20", 20],
    ["0,2", 20],
    ["12", 1200],
    ["0", 0],
    [" 1.25 ", 125],
    ["99,99", 9999],
  ])("%s → %s", (text, bps) => {
    expect(parsePercentToBps(text)).toBe(bps);
  });

  it.each([undefined, "", "abc", "1,555", "-1", "100", "1e2", "1,", ",5"])("rechaza %j", (text) => {
    expect(parsePercentToBps(text)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  calendarDate,
  dec,
  money,
  netWorth,
  type AccountInput,
  type FxRate,
  type NetWorthInput,
} from "../../src";

const d = calendarDate;
const today = d("2026-10-27");
const usd: FxRate = {
  base: "EUR",
  quote: "USD",
  asOf: d("2026-10-26"),
  rate: dec("1.25"),
  source: "BCE",
};

const base = (overrides: Partial<NetWorthInput> = {}): NetWorthInput => ({
  baseCurrency: "EUR",
  onDate: today,
  accounts: [],
  allocations: [],
  fxRates: [usd],
  ...overrides,
});

const ledger = (id: string, minor: bigint, asOf = "2026-10-20"): AccountInput => ({
  accountId: id,
  isLiability: false,
  ledger: { amount: money(minor, "EUR"), asOf: d(asOf) },
});

describe("netWorth", () => {
  it("sin cuentas devuelve cero y calidad completa", () => {
    const r = netWorth(base());
    expect(r.value.total).toEqual(money(0n, "EUR"));
    expect(r.value.byPocket).toEqual([]);
    expect(r.explanation.quality.level).toBe("complete");
    expect(r.explanation.method).toBe("net_worth.sum_of_accounts");
  });

  it("suma activos y resta pasivos valorados (la valoración del pasivo es lo que se debe)", () => {
    const r = netWorth(
      base({
        accounts: [
          ledger("banco", 1_000_00n),
          {
            accountId: "hipoteca",
            isLiability: true,
            valuation: { amount: money(300_00n, "EUR"), asOf: d("2026-10-01") },
          },
        ],
      }),
    );
    expect(r.value.assets).toEqual(money(1_000_00n, "EUR"));
    expect(r.value.liabilities).toEqual(money(300_00n, "EUR"));
    expect(r.value.total).toEqual(money(700_00n, "EUR"));
    expect(r.explanation.accounts[1]).toMatchObject({
      basis: "valuation",
      ageDays: 26,
      stale: false,
    });
  });

  it("un descubierto en el libro cuenta como pasivo con su signo", () => {
    const r = netWorth(base({ accounts: [ledger("banco", -50_00n)] }));
    expect(r.value.liabilities).toEqual(money(50_00n, "EUR"));
    expect(r.value.total).toEqual(money(-50_00n, "EUR"));
  });

  it("prefiere la valoración al saldo del libro y marca los valores antiguos", () => {
    const r = netWorth(
      base({
        accounts: [
          {
            accountId: "fondo",
            isLiability: false,
            ledger: { amount: money(1n, "EUR"), asOf: d("2026-10-26") },
            valuation: { amount: money(2_000_00n, "EUR"), asOf: d("2026-08-01") },
          },
        ],
        staleAfterDays: 60,
      }),
    );
    expect(r.value.total).toEqual(money(2_000_00n, "EUR"));
    expect(r.explanation.accounts[0]).toMatchObject({
      basis: "valuation",
      ageDays: 87,
      stale: true,
    });
  });

  it("convierte a la moneda base con el tipo vigente y lo explica", () => {
    const r = netWorth(
      base({
        accounts: [
          {
            accountId: "broker",
            isLiability: false,
            ledger: { amount: money(125_00n, "USD"), asOf: d("2026-10-26") },
          },
        ],
      }),
    );
    expect(r.value.total).toEqual(money(100_00n, "EUR"));
    expect(r.explanation.accounts[0]?.fx.method).toBe("inverse");
  });

  it("excluye cuentas sin valor o sin tipo de cambio y marca el resultado como parcial", () => {
    const r = netWorth(
      base({
        accounts: [
          ledger("banco", 10_00n),
          { accountId: "vacia", isLiability: false },
          {
            accountId: "yenes",
            isLiability: false,
            ledger: { amount: money(1000n, "JPY"), asOf: today },
          },
        ],
      }),
    );
    expect(r.value.total).toEqual(money(10_00n, "EUR"));
    expect(r.explanation.quality.level).toBe("partial");
    expect(r.explanation.quality.excluded).toEqual([
      { accountId: "vacia", code: "net_worth.no_value" },
      expect.objectContaining({ accountId: "yenes", code: "fx.rate_not_found" }),
    ]);
  });

  it("reparte por bolsillos sin perder céntimos y deja el resto sin asignar", () => {
    const r = netWorth(
      base({
        accounts: [ledger("banco", 100_01n), ledger("otra", 5_00n)],
        allocations: [
          { pocketId: "colchon", accountId: "banco", assetId: null, weightBps: 5000 },
          { pocketId: "casa", accountId: "banco", assetId: null, weightBps: 2500 },
          { pocketId: "casa", accountId: "otra", assetId: null, weightBps: 10000 },
        ],
      }),
    );
    expect(r.value.byPocket).toEqual([
      { pocketId: "colchon", value: money(50_01n, "EUR") },
      { pocketId: "casa", value: money(30_00n, "EUR") },
    ]);
    expect(r.value.unassigned).toEqual(money(25_00n, "EUR"));
    expect(r.explanation.quality.level).toBe("complete");
  });

  it("no aplica repartos por posición ni repartos inválidos: van sin asignar", () => {
    const r = netWorth(
      base({
        accounts: [ledger("broker", 10_00n), ledger("mal", 20_00n), ledger("roto", 30_00n)],
        allocations: [
          { pocketId: "largo", accountId: "broker", assetId: "etf", weightBps: 10000 },
          { pocketId: "a", accountId: "mal", assetId: null, weightBps: 8000 },
          { pocketId: "b", accountId: "mal", assetId: null, weightBps: 3000 },
          { pocketId: "c", accountId: "roto", assetId: null, weightBps: 12.5 },
        ],
      }),
    );
    expect(r.value.byPocket).toEqual([]);
    expect(r.value.unassigned).toEqual(money(60_00n, "EUR"));
    expect(r.explanation.quality.unallocated.map((u) => u.code)).toEqual([
      "net_worth.position_allocation_unsupported",
      "net_worth.invalid_allocation",
      "net_worth.invalid_allocation",
    ]);
    expect(r.explanation.quality.level).toBe("partial");
  });

  it("suma a la valoración los movimientos posteriores y actualiza su antigüedad", () => {
    const r = netWorth(
      base({
        accounts: [
          {
            accountId: "banco",
            isLiability: false,
            valuation: { amount: money(1_000_00n, "EUR"), asOf: d("2026-10-01") },
            movementsAfterValuation: { amount: money(-40_00n, "EUR"), asOf: d("2026-10-25") },
          },
        ],
      }),
    );
    expect(r.value.total).toEqual(money(960_00n, "EUR"));
    const line = r.explanation.accounts[0];
    expect(line?.basis).toBe("valuation");
    expect(line?.asOf).toBe(d("2026-10-25"));
    expect(line?.movementsAfterValuation).toEqual(money(-40_00n, "EUR"));
    expect(r.explanation.assumptions).toContain("net_worth.movements_after_valuation");
  });

  it("en un pasivo, un pago posterior reduce lo que se debe", () => {
    const r = netWorth(
      base({
        accounts: [
          {
            accountId: "prestamo",
            isLiability: true,
            valuation: { amount: money(300_00n, "EUR"), asOf: d("2026-10-01") },
            movementsAfterValuation: { amount: money(50_00n, "EUR"), asOf: d("2026-10-10") },
          },
        ],
      }),
    );
    expect(r.value.liabilities).toEqual(money(250_00n, "EUR"));
    expect(r.value.total).toEqual(money(-250_00n, "EUR"));
  });

  it("no rejuvenece la valoración si el último movimiento es anterior a ella", () => {
    const r = netWorth(
      base({
        accounts: [
          {
            accountId: "banco",
            isLiability: false,
            valuation: { amount: money(100_00n, "EUR"), asOf: d("2026-10-20") },
            movementsAfterValuation: { amount: money(0n, "EUR"), asOf: d("2026-10-05") },
          },
        ],
      }),
    );
    expect(r.explanation.accounts[0]?.asOf).toBe(d("2026-10-20"));
  });

  it("una cuenta compartida solo aporta tu parte, también en deudas y con redondeo", () => {
    const r = netWorth(
      base({
        accounts: [
          { ...ledger("conjunta", 186_81n), shareBps: 5000 },
          ledger("propia", 100_00n),
          {
            accountId: "deuda",
            isLiability: true,
            valuation: { amount: money(200_00n, "EUR"), asOf: d("2026-10-20") },
            shareBps: 2500,
          },
        ],
      }),
    );
    // 186,81 al 50 % = 93,405 → 93,41 (el céntimo sobrante va a tu parte); deuda 200 al 25 % = 50
    expect(r.value.assets).toEqual(money(193_41n, "EUR"));
    expect(r.value.liabilities).toEqual(money(50_00n, "EUR"));
    expect(r.explanation.accounts.map((l) => l.shareBps)).toEqual([5000, 10000, 2500]);
    expect(r.explanation.assumptions).toContain("net_worth.account_share_applied");
  });

  it("la parte repartida entre bolsillos suma lo mismo que tu aportación", () => {
    const r = netWorth(
      base({
        accounts: [{ ...ledger("a", 100_00n), shareBps: 5000 }],
        allocations: [{ pocketId: "p", accountId: "a", assetId: null, weightBps: 10000 }],
      }),
    );
    expect(r.value.byPocket).toEqual([{ pocketId: "p", value: money(50_00n, "EUR") }]);
    expect(r.value.unassigned).toEqual(money(0n, "EUR"));
  });
});

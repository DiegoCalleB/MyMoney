import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calendarDate,
  money,
  netWorth,
  type AccountInput,
  type PocketAllocationInput,
} from "../../src";

const RUNS = { numRuns: 500 };
const today = calendarDate("2026-10-27");
const amount = fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n });
const pocketIds = ["colchon", "casa", "largo"] as const;

const scenario = fc
  .array(
    fc.record({
      minor: amount,
      isLiability: fc.boolean(),
      useValuation: fc.boolean(),
      weights: fc.array(fc.integer({ min: 0, max: 4000 }), { minLength: 0, maxLength: 3 }),
    }),
    { maxLength: 8 },
  )
  .map((rows) => {
    const accounts: AccountInput[] = [];
    const allocations: PocketAllocationInput[] = [];
    rows.forEach((row, i) => {
      const accountId = `cuenta-${String(i)}`;
      const observed = { amount: money(row.minor, "EUR"), asOf: today };
      accounts.push(
        row.useValuation
          ? {
              accountId,
              isLiability: row.isLiability,
              valuation: {
                ...observed,
                amount: money(row.minor < 0n ? -row.minor : row.minor, "EUR"),
              },
            }
          : { accountId, isLiability: row.isLiability, ledger: observed },
      );
      row.weights.forEach((weightBps, j) => {
        allocations.push({ pocketId: pocketIds[j] as string, accountId, assetId: null, weightBps });
      });
    });
    return { accounts, allocations };
  });

describe("propiedades de netWorth", () => {
  it("bolsillos + sin asignar = total = activos − pasivos, sin perder céntimos", () => {
    fc.assert(
      fc.property(scenario, ({ accounts, allocations }) => {
        const { value } = netWorth({
          baseCurrency: "EUR",
          onDate: today,
          accounts,
          allocations,
          fxRates: [],
        });
        const pockets = value.byPocket.reduce((acc, p) => acc + p.value.minor, 0n);
        expect(pockets + value.unassigned.minor).toBe(value.total.minor);
        expect(value.assets.minor - value.liabilities.minor).toBe(value.total.minor);
        expect(value.assets.minor >= 0n && value.liabilities.minor >= 0n).toBe(true);
      }),
      RUNS,
    );
  });

  it("el total no depende del reparto entre bolsillos", () => {
    fc.assert(
      fc.property(scenario, ({ accounts, allocations }) => {
        const input = { baseCurrency: "EUR" as const, onDate: today, accounts, fxRates: [] };
        const withPockets = netWorth({ ...input, allocations });
        const without = netWorth({ ...input, allocations: [] });
        expect(withPockets.value.total).toEqual(without.value.total);
        expect(without.value.unassigned).toEqual(without.value.total);
      }),
      RUNS,
    );
  });
});

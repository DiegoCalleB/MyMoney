import { calendarDate, money, type AccountLine } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import {
  buildExposure,
  compositionRow,
  isDimension,
  type ExposureAccount,
} from "@/server/exposure-model";

const today = calendarDate("2026-10-29");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const line = (n: number, minor: bigint): AccountLine => ({
  accountId: ID(n),
  basis: "valuation",
  asOf: today,
  original: money(minor, "EUR"),
  contribution: money(minor, "EUR"),
  fx: { method: "identity", effectiveRate: "1", rates: [], staleDays: 0 },
  ageDays: 0,
  stale: false,
});
const account = (
  n: number,
  kind: ExposureAccount["kind"],
  asset: number | null,
): ExposureAccount => ({
  id: ID(n),
  name: `Cuenta ${String(n)}`,
  kind,
  primaryAssetId: asset === null ? null : ID(100 + asset),
});
const comp = (asset: number, key: string, bps: number, asOf = "2026-09-30") =>
  compositionRow.parse({ asset_id: ID(100 + asset), as_of: asOf, key, weight_bps: bps });

describe("buildExposure", () => {
  it("reparte el valor de cada cuenta de inversión según la composición de su activo", () => {
    const model = buildExposure(
      [account(1, "fund_holding", 1), account(2, "pension_plan", 2), account(3, "current", null)],
      [line(1, 100_00n), line(2, 50_00n), line(3, 999_00n)],
      [comp(1, "Europa", 6000), comp(1, "EE. UU.", 4000), comp(2, "Europa", 10000)],
      "region",
      "EUR",
      today,
    );
    if (!model.result.ok) throw new Error(model.result.error.code);
    const buckets = model.result.value.value.buckets;
    expect(buckets.map((b) => [b.key, b.amount.minor])).toEqual([
      ["Europa", 110_00n],
      ["EE. UU.", 40_00n],
    ]);
    // La cuenta corriente no entra: no es una inversión.
    expect(model.result.value.value.total.minor).toBe(150_00n);
    expect(model.undeclared).toEqual([]);
  });

  it("las cuentas sin activo o sin composición de esa dimensión quedan sin clasificar y se piden", () => {
    const model = buildExposure(
      [account(1, "fund_holding", 1), account(2, "brokerage", null), account(3, "crypto", 3)],
      [line(1, 100_00n), line(2, 40_00n), line(3, 10_00n)],
      [comp(1, "Europa", 10000)],
      "region",
      "EUR",
      today,
    );
    if (!model.result.ok) throw new Error(model.result.error.code);
    expect(model.result.value.value.unclassified.minor).toBe(50_00n);
    expect(model.result.value.explanation.caveats).toContain("exposure.caveat.missing_composition");
    expect(model.undeclared.map((a) => a.id)).toEqual([ID(2), ID(3)]);
  });

  it("ignora cuentas sin valor positivo y los datos de otra dimensión no se mezclan", () => {
    const model = buildExposure(
      [account(1, "fund_holding", 1), account(2, "fund_holding", 2)],
      [line(1, 0n)],
      [comp(1, "Europa", 10000)],
      "region",
      "EUR",
      today,
    );
    if (!model.result.ok) throw new Error(model.result.error.code);
    expect(model.result.value.value.total.minor).toBe(0n);
    expect(model.undeclared.map((a) => a.id)).toEqual([ID(1)]);
  });

  it("reconoce las dimensiones permitidas", () => {
    expect(isDimension("region")).toBe(true);
    expect(isDimension("asset_class")).toBe(true);
    expect(isDimension("otra")).toBe(false);
    expect(isDimension(undefined)).toBe(false);
  });
});

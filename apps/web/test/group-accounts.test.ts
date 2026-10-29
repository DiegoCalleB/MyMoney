import { calendarDate, money, type AccountLine } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { groupAccounts } from "@/server/group-accounts";

const line = (id: string, minor: bigint): AccountLine => ({
  accountId: id,
  basis: "valuation",
  asOf: calendarDate("2026-10-25"),
  original: money(minor, "EUR"),
  shareBps: 10000,
  contribution: money(minor, "EUR"),
  fx: { method: "identity", effectiveRate: "1", rates: [], staleDays: 0 },
  ageDays: 0,
  stale: false,
});

const meta = (name: string, institutionId: string | null) => ({ name, institutionId });
const institutions = new Map([
  ["tr", "Trade Republic"],
  ["bn", "Binance"],
]);

describe("groupAccounts", () => {
  it("agrupa por entidad con subtotal y ordena por importe", () => {
    const groups = groupAccounts(
      [line("a", 100_00n), line("b", 900_00n), line("c", 50_00n), line("d", 20_00n)],
      new Map([
        ["a", meta("Binance euros", "bn")],
        ["b", meta("TR efectivo", "tr")],
        ["c", meta("Binance cripto", "bn")],
        ["d", meta("TR cartera", "tr")],
      ]),
      institutions,
    );
    expect(groups.map((g) => [g.name, g.total.minor, g.lines.length])).toEqual([
      ["Trade Republic", 920_00n, 2],
      ["Binance", 150_00n, 2],
    ]);
  });

  it("las cuentas sin entidad (o con entidad desconocida) no se agrupan entre sí", () => {
    const groups = groupAccounts(
      [line("a", 10n), line("b", 20n), line("c", 30n)],
      new Map([
        ["a", meta("Suelta A", null)],
        ["b", meta("Suelta B", null)],
        ["c", meta("Rara", "desconocida")],
      ]),
      institutions,
    );
    expect(groups.map((g) => [g.name, g.institutionId])).toEqual([
      ["Rara", null],
      ["Suelta B", null],
      ["Suelta A", null],
    ]);
  });

  it("desempata por nombre y tolera cuentas sin metadatos", () => {
    const groups = groupAccounts(
      [line("x", 5n), line("y", 5n)],
      new Map([["y", meta("Beta", null)]]),
      institutions,
    );
    expect(groups.map((g) => g.name)).toEqual(["", "Beta"]);
    expect(groupAccounts([], new Map(), institutions)).toEqual([]);
  });
});

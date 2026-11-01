import { calendarDate, money } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { accountRow, valuationRow } from "@/server/home-model";
import {
  buildNetWorthHistory,
  changeSinceLastClose,
  historyDates,
  type HistoryPoint,
} from "@/server/history-model";

const today = calendarDate("2026-10-27");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const space = { id: ID(1), name: "Casa", base_currency: "EUR", timezone: "Europe/Madrid" } as const;
const account = (n: number, over: Record<string, unknown> = {}) =>
  accountRow.parse({
    id: ID(n),
    name: `Cuenta ${String(n)}`,
    kind: "current",
    is_liability: false,
    currency: "EUR",
    scope: "household",
    closed_on: null,
    institution_id: null,
    share_bps: 10000,
    ...over,
  });
const valuation = (n: number, as_of: string, minor: number) =>
  valuationRow.parse({ account_id: ID(n), as_of, value_minor: minor, currency: "EUR" });

describe("historyDates", () => {
  it("da los finales de los doce meses anteriores y hoy", () => {
    const dates = historyDates(today);
    expect(dates).toHaveLength(13);
    expect(dates[0]).toBe("2025-10-31");
    expect(dates[11]).toBe("2026-09-30");
    expect(dates[12]).toBe(today);
  });

  it("respeta el número de meses pedido y el cambio de año", () => {
    expect(historyDates(calendarDate("2026-01-05"), 2)).toEqual([
      "2025-11-30",
      "2025-12-31",
      "2026-01-05",
    ]);
  });
});

describe("buildNetWorthHistory", () => {
  const rows = {
    space: { ...space },
    accounts: [account(2), account(3, { is_liability: true, kind: "mortgage" })],
    fxRates: [],
  };

  it("usa la última valoración vigente en cada fecha y omite lo anterior a la primera", () => {
    const history = buildNetWorthHistory(
      {
        ...rows,
        valuations: [
          valuation(2, "2026-03-15", 1_000_00),
          valuation(2, "2026-08-02", 1_500_00),
          valuation(3, "2026-08-02", 200_00),
        ],
      },
      today,
    );
    const at = (d: string) => history.find((p) => p.date === d)?.total.minor;
    expect(history[0]?.date).toBe("2026-03-31"); // antes de la primera valoración no hay punto
    expect(at("2026-03-31")).toBe(1_000_00n);
    expect(at("2026-07-31")).toBe(1_000_00n); // sigue la valoración de marzo
    expect(at("2026-08-31")).toBe(1_300_00n); // 1 500 € menos 200 € de deuda
    expect(history.at(-1)?.date).toBe(today);
    expect(history.at(-1)?.total.minor).toBe(1_300_00n);
  });

  it("sin valoraciones no hay evolución", () => {
    expect(buildNetWorthHistory({ ...rows, valuations: [] }, today)).toEqual([]);
  });
});

describe("changeSinceLastClose", () => {
  const point = (date: string, minor: bigint): HistoryPoint => ({
    date: calendarDate(date),
    total: money(minor, "EUR"),
  });
  const history = [
    point("2026-08-31", 100_000n),
    point("2026-09-30", 200_000n),
    point("2026-10-27", 250_000n),
  ];

  it("compara con el último cierre de mes anterior al actual", () => {
    const change = changeSinceLastClose(history, money(250_000n, "EUR"), today);
    expect(change?.since).toBe("2026-09-30");
    expect(change?.delta.minor).toBe(50_000n);
    expect(change?.bps).toBe(2500n); // +25 %
  });

  it("una bajada sale negativa", () => {
    expect(changeSinceLastClose(history, money(150_000n, "EUR"), today)?.bps).toBe(-2500n);
  });

  it("sin base positiva no hay porcentaje, y sin cierre previo ni moneda igual no hay cambio", () => {
    expect(
      changeSinceLastClose([point("2026-09-30", 0n)], money(10n, "EUR"), today)?.bps,
    ).toBeNull();
    expect(changeSinceLastClose([point("2026-10-10", 5n)], money(10n, "EUR"), today)).toBeNull();
    expect(changeSinceLastClose([point("2026-09-30", 5n)], money(10n, "USD"), today)).toBeNull();
    expect(changeSinceLastClose([], money(10n, "EUR"), today)).toBeNull();
  });
});

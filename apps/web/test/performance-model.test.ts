import { calendarDate, money } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { externalFlowRow } from "@/server/home-model";
import {
  buildPerformance,
  combineValuations,
  isPeriod,
  periodStart,
  TOTAL_ID,
  type PerfValuationRow,
} from "@/server/performance-model";

const d = calendarDate;
const today = d("2026-10-28");
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const flow = (n: number, on: string, minor: number, currency = "EUR") =>
  externalFlowRow.parse({ account_id: ID(n), occurred_on: on, currency, amount_minor: minor });
const val = (n: number, on: string, minor: bigint): PerfValuationRow => ({
  account_id: ID(n),
  as_of: d(on),
  value_minor: minor,
  currency: "EUR",
});
const acc = (n: number, currency: "EUR" | "USD" = "EUR") => ({
  id: ID(n),
  name: `Cuenta ${String(n)}`,
  currency,
});

describe("periodos", () => {
  it("calcula el inicio de cada ventana", () => {
    expect(isPeriod("1a")).toBe(true);
    expect(isPeriod("x")).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
    expect(periodStart("todo", today)).toBeNull();
    expect(periodStart("ytd", today)).toBe(d("2026-01-01"));
    expect(periodStart("1m", today)).toBe(d("2026-09-28"));
    expect(periodStart("6m", today)).toBe(d("2026-04-29"));
    expect(periodStart("1a", today)).toBe(d("2025-10-28"));
    expect(periodStart("2a", today)).toBe(d("2024-10-28"));
  });
});

describe("combineValuations", () => {
  it("suma lo último valorado de cada cuenta en cada fecha", () => {
    const a = [
      { date: d("2025-01-01"), value: money(100n, "EUR") },
      { date: d("2025-03-01"), value: money(150n, "EUR") },
    ];
    const b = [{ date: d("2025-02-01"), value: money(10n, "EUR") }];
    expect(combineValuations([a, b], "EUR").map((p) => [p.date, p.value.minor])).toEqual([
      [d("2025-01-01"), 100n],
      [d("2025-02-01"), 110n],
      [d("2025-03-01"), 160n],
    ]);
    expect(combineValuations([], "EUR")).toEqual([]);
  });
});

describe("buildPerformance", () => {
  const flows = [flow(1, "2025-01-01", 100_00), flow(2, "2025-01-01", 200_00)];
  const values = [
    val(1, "2025-02-01", 110_00n),
    val(2, "2025-02-01", 210_00n),
    val(1, "2025-06-01", 120_00n),
    val(2, "2025-06-01", 220_00n),
  ];
  const accounts = [acc(1), acc(2), acc(3), acc(4, "USD")];

  it("ofrece el total y cada cuenta con aportaciones, y calcula el total", () => {
    const m = buildPerformance(accounts, values, flows, "EUR", undefined, "todo", today);
    expect(m.options.map((o) => o.id)).toEqual([TOTAL_ID, ID(1), ID(2)]);
    expect(m.selected).toBe(TOTAL_ID);
    const last = m.result.ok ? m.result.value.points.at(-1) : undefined;
    expect(last?.value.minor).toBe(340_00n);
    expect(last?.contributed.minor).toBe(300_00n);
    expect(last?.ratio?.toFixed(4)).toBe("0.1333");
  });

  it("selecciona una cuenta y aplica la ventana", () => {
    const m = buildPerformance(accounts, values, flows, "EUR", ID(1), "1m", d("2025-07-01"));
    expect(m.selected).toBe(ID(1));
    const points = m.result.ok ? m.result.value.points : [];
    expect(points.map((p) => p.date)).toEqual([d("2025-06-01")]);
  });

  it("una cuenta desconocida cae en la primera opción; sin aportaciones no hay opciones", () => {
    expect(buildPerformance(accounts, values, flows, "EUR", "otra", "todo", today).selected).toBe(
      TOTAL_ID,
    );
    const empty = buildPerformance(accounts, values, [], "EUR", undefined, "todo", today);
    expect(empty.options).toEqual([]);
    expect(empty.result).toEqual({ ok: false, error: { code: "performance.no_flows" } });
  });

  it("con una sola cuenta no ofrece total; una cuenta en otra moneda va aparte", () => {
    const single = buildPerformance(
      [acc(1)],
      values,
      [flow(1, "2025-01-01", 100_00)],
      "EUR",
      undefined,
      "todo",
      today,
    );
    expect(single.options.map((o) => o.id)).toEqual([ID(1)]);
    const usd = buildPerformance(
      [acc(1), acc(4, "USD")],
      [...values, { ...val(4, "2025-02-01", 50_00n), currency: "USD" }],
      [flow(1, "2025-01-01", 100_00), flow(4, "2025-01-01", 40_00, "USD")],
      "EUR",
      ID(4),
      "todo",
      today,
    );
    expect(usd.currency).toBe("USD");
    expect(usd.options.map((o) => o.id)).toEqual([ID(1), ID(4)]);
    expect(usd.result.ok && usd.result.value.points[0]?.value.currency).toBe("USD");
  });
});

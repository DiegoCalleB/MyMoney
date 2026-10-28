import { describe, expect, it } from "vitest";
import {
  calendarDate,
  money,
  performanceSeries,
  type ExternalFlow,
  type ValuePoint,
} from "../../src";

const d = calendarDate;
const eur = (minor: bigint) => money(minor, "EUR");
const v = (date: string, minor: bigint): ValuePoint => ({ date: d(date), value: eur(minor) });
const f = (date: string, minor: bigint): ExternalFlow => ({ date: d(date), amount: eur(minor) });
const run = (
  valuations: ValuePoint[],
  flows: ExternalFlow[],
  from: string | null = null,
  onDate = "2026-10-28",
) => {
  const r = performanceSeries({
    currency: "EUR",
    valuations,
    flows,
    from: from === null ? null : d(from),
    onDate: d(onDate),
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("performanceSeries", () => {
  it("sin aportaciones o sin valoraciones no es calculable", () => {
    const base = { currency: "EUR", from: null, onDate: d("2026-10-28") } as const;
    expect(performanceSeries({ ...base, valuations: [v("2025-01-01", 1n)], flows: [] })).toEqual({
      ok: false,
      error: { code: "performance.no_flows" },
    });
    expect(performanceSeries({ ...base, valuations: [], flows: [f("2025-01-01", 1n)] })).toEqual({
      ok: false,
      error: { code: "performance.no_valuations" },
    });
    // Solo hay valoraciones anteriores a la primera aportación.
    expect(
      performanceSeries({
        ...base,
        valuations: [v("2024-01-01", 1n)],
        flows: [f("2025-01-01", 1n)],
      }),
    ).toEqual({ ok: false, error: { code: "performance.no_valuations" } });
  });

  it("calcula ganancia y rentabilidad acumulada en cada valoración", () => {
    const r = run(
      [v("2025-02-01", 105_00n), v("2025-06-01", 130_00n), v("2025-12-01", 260_00n)],
      [f("2025-01-01", 100_00n), f("2025-05-01", 100_00n)],
    );
    expect(r.points.map((p) => p.contributed.minor)).toEqual([100_00n, 200_00n, 200_00n]);
    expect(r.points.map((p) => p.gain.minor)).toEqual([5_00n, -70_00n, 60_00n]);
    expect(r.points.map((p) => p.ratio?.toFixed(3))).toEqual(["0.050", "-0.350", "0.300"]);
    expect(r.explanation.method).toBe("performance.cumulative_simple");
    expect(r.explanation.caveats).toEqual([
      "performance.caveat.not_annualized",
      "performance.caveat.no_values_before_first",
    ]);
    expect(r.explanation.start).toBe(d("2025-02-01"));
  });

  it("una aportación del mismo día de la valoración cuenta", () => {
    const r = run([v("2025-01-01", 100_00n)], [f("2025-01-01", 100_00n)]);
    expect(r.points[0]?.ratio?.toFixed(2)).toBe("0.00");
    expect(r.explanation.caveats).toEqual(["performance.caveat.not_annualized"]);
  });

  it("recorta la ventana sin cambiar los valores de los puntos", () => {
    const valuations = [
      v("2025-02-01", 105_00n),
      v("2025-06-01", 130_00n),
      v("2025-12-01", 260_00n),
    ];
    const flows = [f("2025-01-01", 100_00n), f("2025-05-01", 100_00n)];
    const all = run(valuations, flows);
    const window = run(valuations, flows, "2025-05-15");
    expect(window.points).toEqual(all.points.slice(1));
    expect(window.explanation.start).toBe(d("2025-06-01"));
  });

  it("una ventana sin valoraciones no es calculable", () => {
    const r = performanceSeries({
      currency: "EUR",
      valuations: [v("2025-02-01", 105_00n)],
      flows: [f("2025-01-01", 100_00n)],
      from: d("2026-01-01"),
      onDate: d("2026-10-28"),
    });
    expect(r).toEqual({ ok: false, error: { code: "performance.no_valuations" } });
  });

  it("avisa si la serie empieza después de la primera aportación", () => {
    const r = run([v("2025-06-01", 110_00n)], [f("2025-01-01", 100_00n)]);
    expect(r.explanation.caveats).toContain("performance.caveat.no_values_before_first");
  });

  it("con aportado no positivo no hay porcentaje", () => {
    const r = run([v("2025-03-01", 10_00n)], [f("2025-01-01", 100_00n), f("2025-02-01", -100_00n)]);
    expect(r.points[0]?.ratio).toBeNull();
    expect(r.points[0]?.gain.minor).toBe(10_00n);
  });

  it("ignora valoraciones y flujos posteriores a hoy", () => {
    const r = run(
      [v("2025-02-01", 105_00n), v("2027-01-01", 999_00n)],
      [f("2025-01-01", 100_00n), f("2027-01-01", 50_00n)],
    );
    expect(r.points).toHaveLength(1);
    expect(r.points[0]?.contributed.minor).toBe(100_00n);
  });
});

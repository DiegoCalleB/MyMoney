import { describe, expect, it } from "vitest";
import {
  calendarDate,
  exposure,
  money,
  type CompositionRow,
  type ExposurePosition,
} from "../../src";

const d = calendarDate;
const eur = (minor: bigint) => money(minor, "EUR");
const row = (asOf: string, key: string, weightBps: number): CompositionRow => ({
  asOf: d(asOf),
  key,
  weightBps,
});
const position = (
  assetId: string,
  minor: bigint,
  composition: CompositionRow[],
): ExposurePosition => ({ assetId, value: eur(minor), composition });
const run = (positions: ExposurePosition[], onDate = "2026-10-28") => {
  const r = exposure({ dimension: "region", currency: "EUR", positions, onDate: d(onDate) });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("exposure", () => {
  it("reparte cada posición según su composición y suma por clave", () => {
    const r = run([
      position("a", 100_00n, [row("2026-09-30", "usa", 6000), row("2026-09-30", "europa", 4000)]),
      position("b", 50_00n, [row("2026-09-30", "usa", 2000), row("2026-09-30", "europa", 8000)]),
    ]);
    expect(r.value.buckets.map((b) => [b.key, b.amount.minor])).toEqual(
      [
        ["usa", 70_00n],
        ["europa", 80_00n],
      ].sort((x, y) => ((y[1] as bigint) > (x[1] as bigint) ? 1 : -1)),
    );
    expect(r.value.total).toEqual(eur(150_00n));
    expect(r.value.unclassified).toEqual(eur(0n));
    expect(r.value.coverage?.toFixed(2)).toBe("1.00");
    expect(r.explanation.caveats).toEqual([]);
  });

  it("ordena de mayor a menor importe y, a igualdad, por clave", () => {
    const r = run([
      position("a", 100n, [row("2026-09-30", "b", 5000), row("2026-09-30", "a", 5000)]),
    ]);
    expect(r.value.buckets.map((b) => b.key)).toEqual(["a", "b"]);
  });

  it("usa la última composición no posterior a hoy", () => {
    const r = run([
      position("a", 100n, [
        row("2025-12-31", "viejo", 10000),
        row("2026-06-30", "nuevo", 10000),
        row("2027-01-01", "futuro", 10000),
      ]),
    ]);
    expect(r.value.buckets.map((b) => b.key)).toEqual(["nuevo"]);
  });

  it("una posición sin composición queda sin clasificar y se dice", () => {
    const r = run([position("a", 100n, []), position("b", 100n, [row("2026-09-30", "x", 10000)])]);
    expect(r.value.unclassified).toEqual(eur(100n));
    expect(r.value.coverage?.toFixed(2)).toBe("0.50");
    expect(r.explanation.withoutData).toEqual(["a"]);
    expect(r.explanation.caveats).toEqual(["exposure.caveat.missing_composition"]);
  });

  it("una composición parcial deja el resto sin clasificar y se dice", () => {
    const r = run([position("a", 1000n, [row("2026-09-30", "top10", 3000)])]);
    expect(r.value.buckets[0]?.amount).toEqual(eur(300n));
    expect(r.value.unclassified).toEqual(eur(700n));
    expect(r.explanation.caveats).toEqual(["exposure.caveat.partial_composition"]);
  });

  it("señala una composición con más de 400 días", () => {
    const r = run([position("a", 100n, [row("2025-01-01", "x", 10000)])]);
    expect(r.explanation.caveats).toEqual(["exposure.caveat.old_composition"]);
  });

  it("suma las filas repetidas de una misma clave", () => {
    const r = run([
      position("a", 100n, [row("2026-09-30", "x", 4000), row("2026-09-30", "x", 6000)]),
    ]);
    expect(r.value.buckets).toHaveLength(1);
    expect(r.value.buckets[0]?.amount).toEqual(eur(100n));
  });

  it("sin posiciones o con total cero no hay cobertura ni reparto", () => {
    expect(run([]).value.coverage).toBeNull();
    const zero = run([position("a", 0n, [row("2026-09-30", "x", 10000)])]);
    expect(zero.value.coverage).toBeNull();
    expect(zero.value.buckets[0]?.share.toFixed(0)).toBe("0");
  });

  it("rechaza moneda distinta, valores negativos y pesos no válidos", () => {
    const base = { dimension: "region", currency: "EUR" as const, onDate: d("2026-10-28") };
    const usd = { assetId: "u", value: money(1n, "USD"), composition: [] };
    expect(exposure({ ...base, positions: [usd] })).toEqual({
      ok: false,
      error: { code: "exposure.currency_mismatch", params: { assetId: "u" } },
    });
    expect(exposure({ ...base, positions: [position("n", -1n, [])] })).toEqual({
      ok: false,
      error: { code: "exposure.negative_value", params: { assetId: "n" } },
    });
    for (const rows of [
      [row("2026-09-30", "x", 6000), row("2026-09-30", "y", 5000)],
      [row("2026-09-30", "x", -1)],
      [row("2026-09-30", "x", 0.5)],
    ]) {
      expect(exposure({ ...base, positions: [position("w", 100n, rows)] })).toEqual({
        ok: false,
        error: { code: "exposure.invalid_weights", params: { assetId: "w" } },
      });
    }
  });
});

import { describe, expect, it } from "vitest";
import { calendarDate, cpiPoint, dec, realReturn, type CpiPoint, type Decimal } from "../../src";

const d = calendarDate;
const close = (actual: Decimal, expected: string, tolerance = "1e-12"): void => {
  expect(actual.minus(dec(expected)).abs().lte(dec(tolerance))).toBe(true);
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

const cpi: CpiPoint[] = [
  cpiPoint("2026-03", "102"),
  cpiPoint("2026-01", "100"),
  cpiPoint("2026-02", "101"),
  cpiPoint("2026-04", "104.04"),
];

describe("realReturn", () => {
  it("deflacta con el cociente, no con la resta", () => {
    const r = realReturn({
      nominalCumulative: dec("0.05"),
      from: d("2026-01-01"),
      to: d("2026-03-01"),
      cpi,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    close(r.value.value.cumulative.inflation, "0.02");
    close(r.value.value.cumulative.real, "0.029411764705882352941176470588");
    expect(r.value.value.annualizedReliable).toBe(false);
    expect(r.value.explanation.quality.level).toBe("complete");
    expect(r.value.explanation.assumptions).toContain("returns.real_ratio_not_difference");
  });

  it("interpola dentro del mes y anualiza la nominal y la inflación", () => {
    const r = realReturn({
      nominalCumulative: dec("0.1"),
      from: d("2026-01-16"),
      to: d("2026-03-01"),
      cpi,
    });
    if (!r.ok) throw new Error("debería calcular");
    // enero → febrero: 100 + 1 · 15/31
    close(r.value.explanation.cpiIndexFrom, "100.483870967741935483870967741935");
    expect(r.value.value.days).toBe(44);
    expect(r.value.value.annualized?.nominal.gt("0.1")).toBe(true);
  });

  it("en el último mes publicado (o después) usa ese índice y lo avisa", () => {
    const r = realReturn({
      nominalCumulative: dec("0.03"),
      from: d("2026-01-01"),
      to: d("2026-09-15"),
      cpi,
    });
    if (!r.ok) throw new Error("debería calcular");
    close(r.value.explanation.cpiIndexTo, "104.04");
    expect(r.value.explanation.quality.level).toBe("approximate");
    expect(r.value.explanation.quality.notes).toEqual([
      { code: "returns.cpi_latest_published", params: { until: "2026-04" } },
    ]);
  });

  it("un periodo de un día no se anualiza y la real coincide con la nominal sin inflación", () => {
    const r = realReturn({
      nominalCumulative: dec("0.01"),
      from: d("2026-02-01"),
      to: d("2026-02-01"),
      cpi,
    });
    if (!r.ok) throw new Error("debería calcular");
    expect(r.value.value.annualized).toBeNull();
    close(r.value.value.cumulative.real, "0.01");
  });

  it("pasa de diciembre a enero al interpolar", () => {
    const r = realReturn({
      nominalCumulative: dec("0"),
      from: d("2026-12-16"),
      to: d("2027-01-01"),
      cpi: [cpiPoint("2026-12", "100"), cpiPoint("2027-01", "101"), cpiPoint("2027-02", "102")],
    });
    expect(r.ok).toBe(true);
  });

  it("errores: periodo, IPC inválido, IPC ausente o con huecos", () => {
    const base = { nominalCumulative: dec("0.01"), cpi };
    expect(code(realReturn({ ...base, from: d("2026-03-01"), to: d("2026-02-01") }))).toBe(
      "returns.invalid_period",
    );
    expect(
      code(
        realReturn({
          ...base,
          from: d("2026-01-01"),
          to: d("2026-02-01"),
          cpi: [cpiPoint("2026-13", "100")],
        }),
      ),
    ).toBe("returns.cpi_invalid");
    expect(
      code(
        realReturn({
          ...base,
          from: d("2026-01-01"),
          to: d("2026-02-01"),
          cpi: [cpiPoint("2026-01", "0")],
        }),
      ),
    ).toBe("returns.cpi_invalid");
    expect(code(realReturn({ ...base, from: d("2026-01-01"), to: d("2026-02-01"), cpi: [] }))).toBe(
      "returns.cpi_not_available",
    );
    // antes del primer mes publicado
    expect(code(realReturn({ ...base, from: d("2025-12-01"), to: d("2026-02-01") }))).toBe(
      "returns.cpi_not_available",
    );
    const gaps = [
      cpiPoint("2026-01", "100"),
      cpiPoint("2026-02", "101"),
      cpiPoint("2026-05", "103"),
    ];
    // falta el mes siguiente al de partida (marzo)
    expect(
      code(realReturn({ ...base, cpi: gaps, from: d("2026-02-10"), to: d("2026-03-10") })),
    ).toBe("returns.cpi_not_available");
    // el inicio sí tiene datos, el final cae en un hueco
    expect(
      code(realReturn({ ...base, cpi: gaps, from: d("2026-01-10"), to: d("2026-03-20") })),
    ).toBe("returns.cpi_not_available");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calendarDate, cpiPoint, dec, realReturn } from "@mymoney/finance-core";
import { INE_CPI_SERIES, ineCpiUrl, parseIneCpi } from "../src";

/** Respuesta real de la API del INE (DATOS_SERIE/IPC251852, 2002-01 a 2025-12), capturada el 28-10-2026. */
const real: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/ine-ipc251852.json", import.meta.url), "utf8"),
);

const base = (data: unknown[], over: Record<string, unknown> = {}) => ({
  COD: INE_CPI_SERIES,
  Nombre: "Nacional. Índice general. Índice. ",
  FK_Unidad: 133,
  Data: data,
  ...over,
});
const obs = (year: number, month: number, value: number, over: Record<string, unknown> = {}) => ({
  Fecha: 0,
  FK_TipoDato: 1,
  FK_Periodo: month,
  Anyo: year,
  Valor: value,
  Secreto: false,
  ...over,
});
const failure = (input: unknown) => {
  const r = parseIneCpi(input);
  return r.ok ? "ok" : r.error;
};

describe("parseIneCpi con la respuesta real del INE", () => {
  const parsed = parseIneCpi(real);

  it("lee los 288 meses de 2002-01 a 2025-12 en orden y sin huecos", () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { observations, series, name } = parsed.value;
    expect(series).toBe("IPC251852");
    expect(name).toBe("Nacional. Índice general. Índice.");
    expect(observations).toHaveLength(288);
    expect(observations[0]).toEqual({ period: "2002-01-01", index: "69.53" });
    expect(observations.at(-1)).toEqual({ period: "2025-12-01", index: "119.942" });
    observations.forEach((o, i) => {
      const month = 2002 * 12 + i;
      const expected = `${String(Math.floor(month / 12))}-${String((month % 12) + 1).padStart(2, "0")}-01`;
      expect(o.period).toBe(expected);
    });
  });

  it("los índices son texto decimal con a lo sumo tres decimales", () => {
    if (!parsed.ok) throw new Error("debería leerse");
    for (const o of parsed.value.observations) expect(o.index).toMatch(/^\d+(\.\d{1,3})?$/);
  });
});

describe("parseIneCpi: casos límite", () => {
  it("ordena y omite los datos secretos", () => {
    const r = parseIneCpi(
      base([obs(2026, 2, 101.5), obs(2026, 1, 100), obs(2026, 3, 999, { Secreto: true })]),
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        observations: [
          { period: "2026-01-01", index: "100" },
          { period: "2026-02-01", index: "101.5" },
        ],
      },
    });
  });

  it("deja el nombre vacío si falta", () => {
    const r = parseIneCpi(base([obs(2026, 1, 100)], { Nombre: undefined }));
    expect(r).toMatchObject({ ok: true, value: { name: "" } });
  });

  it("rechaza respuestas que no son la serie esperada", () => {
    expect(failure(null)).toEqual({ code: "ine.invalid_response" });
    expect(failure([])).toEqual({ code: "ine.invalid_response" });
    expect(failure({ COD: "IPC1" })).toEqual({ code: "ine.invalid_response" });
    expect(failure(base([obs(2026, 1, 1)], { COD: "IPC1" }))).toEqual({
      code: "ine.unexpected_series",
      params: { series: "IPC1" },
    });
    expect(failure(base([obs(2026, 1, 1)], { FK_Unidad: 3 }))).toEqual({
      code: "ine.unexpected_unit",
      params: { unit: "3" },
    });
    // La serie esperada se puede cambiar (otra base, otro ámbito).
    expect(parseIneCpi(base([obs(2026, 1, 1)], { COD: "IPC9" }), "IPC9").ok).toBe(true);
  });

  it("rechaza una serie sin datos o solo con datos secretos", () => {
    expect(failure(base([]))).toEqual({ code: "ine.no_data" });
    expect(failure(base([obs(2026, 1, 1, { Secreto: true })]))).toEqual({ code: "ine.no_data" });
  });

  it("rechaza observaciones imposibles", () => {
    const bad = [
      "texto",
      obs(2026, 13, 100),
      obs(2026, 0, 100),
      obs(2026.5, 1, 100),
      obs(1800, 1, 100),
      obs(2300, 1, 100),
      obs(2026, 1, 0),
      obs(2026, 1, -3),
      obs(2026, 1, 1e8),
      obs(2026, 1, 100.12345),
      obs(2026, 1, Number.NaN),
      obs(2026, 1, 100, { Valor: "100" }),
      obs(2026, 1, 100, { Anyo: "2026" }),
      obs(2026, 1, 100, { FK_Periodo: "1" }),
    ];
    for (const item of bad) {
      expect(failure(base([obs(2026, 2, 101), item]))).toEqual({
        code: "ine.invalid_observation",
        params: { position: "1" },
      });
    }
  });

  it("rechaza un mes repetido", () => {
    expect(failure(base([obs(2026, 1, 100), obs(2026, 1, 101)]))).toEqual({
      code: "ine.duplicate_period",
      params: { period: "2026-01-01" },
    });
  });
});

describe("ineCpiUrl", () => {
  it("pide la serie completa con parámetro de fechas (sin él la API da 404)", () => {
    expect(ineCpiUrl()).toBe(
      "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC251852?date=20020101:",
    );
    expect(ineCpiUrl("IPC1", 1990)).toBe(
      "https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IPC1?date=19900101:",
    );
  });
});

describe("IPC real del INE con la rentabilidad real", () => {
  it("la inflación de dic-2024 a dic-2025 coincide con el 2,9 % anual que publica el INE", () => {
    const parsed = parseIneCpi(real);
    if (!parsed.ok) throw new Error("debería leerse");
    const cpi = parsed.value.observations.map((o) => cpiPoint(o.period.slice(0, 7), o.index));
    const r = realReturn({
      nominalCumulative: dec("0.05"),
      from: calendarDate("2024-12-01"),
      to: calendarDate("2025-12-01"),
      cpi,
    });
    if (!r.ok) throw new Error("debería calcular");
    const { inflation, real: realRate } = r.value.value.cumulative;
    expect(inflation.minus("0.029").abs().lt("0.0006")).toBe(true);
    expect(realRate.toNumber()).toBeCloseTo(1.05 / (1 + inflation.toNumber()) - 1, 12);
    expect(r.value.explanation.quality.level).toBe("approximate");
  });
});

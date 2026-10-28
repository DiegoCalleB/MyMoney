import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  annualize,
  calendarDate,
  contributedVsGained,
  dec,
  money,
  twr,
  xirr,
  type Decimal,
  type ExternalFlow,
  type ValuePoint,
} from "../../src";

const d = calendarDate;
const eur = (units: number) => money(BigInt(units) * 100n, "EUR");
const point = (date: string, units: number): ValuePoint => ({ date: d(date), value: eur(units) });
const flow = (date: string, units: number): ExternalFlow => ({ date: d(date), amount: eur(units) });
const close = (actual: Decimal, expected: string, tolerance = "1e-9"): void => {
  expect(actual.minus(dec(expected)).abs().lte(dec(tolerance))).toBe(true);
};

const ok = <T>(r: { ok: boolean; value?: T; error?: unknown }): T => {
  expect(r.ok, JSON.stringify(r.error)).toBe(true);
  return r.value as T;
};
const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

describe("contributedVsGained", () => {
  it("separa lo aportado de lo ganado y de lo retirado", () => {
    const r = ok(
      contributedVsGained({
        flows: [flow("2026-01-10", 1000), flow("2026-03-10", 500), flow("2026-06-10", -200)],
        endValue: point("2026-12-31", 1500),
      }),
    );
    expect(r.value.opening).toEqual(eur(0));
    expect(r.value.contributed).toEqual(eur(1500));
    expect(r.value.withdrawn).toEqual(eur(200));
    expect(r.value.netInvested).toEqual(eur(1300));
    expect(r.value.gain).toEqual(eur(200));
    expect(r.explanation.from).toBe("2026-01-10");
    expect(r.explanation.quality.level).toBe("complete");
  });

  it("un saldo que sube solo por aportaciones no es ganancia", () => {
    const r = ok(
      contributedVsGained({
        flows: [flow("2026-01-01", 100), flow("2026-02-01", 100)],
        endValue: point("2026-03-01", 200),
      }),
    );
    expect(r.value.gain).toEqual(eur(0));
  });

  it("cuenta el valor inicial como dinero ya puesto", () => {
    const r = ok(
      contributedVsGained({
        startValue: point("2026-01-01", 5000),
        flows: [flow("2026-02-01", 1000)],
        endValue: point("2026-12-31", 6500),
      }),
    );
    expect(r.value.opening).toEqual(eur(5000));
    expect(r.value.gain).toEqual(eur(500));
  });

  it("sin flujos ni valor inicial, el periodo es el día final", () => {
    const r = ok(contributedVsGained({ flows: [], endValue: point("2026-12-31", 10) }));
    expect(r.explanation.days).toBe(0);
  });

  it("rechaza periodos y flujos fuera de rango", () => {
    expect(
      code(
        contributedVsGained({
          startValue: point("2026-06-01", 1),
          flows: [],
          endValue: point("2026-01-01", 1),
        }),
      ),
    ).toBe("returns.invalid_period");
    expect(
      code(
        contributedVsGained({ flows: [flow("2027-01-01", 1)], endValue: point("2026-12-31", 1) }),
      ),
    ).toBe("returns.flow_outside_period");
    expect(
      code(
        contributedVsGained({
          startValue: point("2026-01-01", 1),
          flows: [flow("2026-01-01", 1)],
          endValue: point("2026-12-31", 1),
        }),
      ),
    ).toBe("returns.flow_outside_period");
  });

  it("no mezcla monedas", () => {
    expect(() =>
      contributedVsGained({
        flows: [{ date: d("2026-01-01"), amount: money(100n, "USD") }],
        endValue: point("2026-12-31", 1),
      }),
    ).toThrow(CurrencyMismatchError);
  });
});

describe("xirr", () => {
  it("un año exacto: 1.000 → 1.100 es un 10 %", () => {
    const r = ok(xirr({ flows: [flow("2026-01-01", 1000)], endValue: point("2027-01-01", 1100) }));
    close(r.value.annualized, "0.1");
    close(r.value.cumulative, "0.1");
    expect(r.value.annualizedReliable).toBe(true);
    expect(r.value.days).toBe(365);
    expect(r.explanation.solver).toBe("newton");
    expect(r.explanation.quality.level).toBe("complete");
  });

  it("coincide con el ejemplo de la documentación de Excel (0,373362535)", () => {
    const r = ok(
      xirr({
        flows: [flow("2008-01-01", 10000)],
        endValue: point("2009-04-01", 2750),
      }),
    );
    // Sin las retiradas intermedias no es el ejemplo: lo montamos completo abajo.
    expect(r.value.annualized.isNegative()).toBe(true);
    const full = ok(
      xirr({
        flows: [
          flow("2008-01-01", 10000),
          flow("2008-03-01", -2750),
          flow("2008-10-30", -4250),
          flow("2009-02-15", -3250),
        ],
        endValue: point("2009-04-01", 2750),
      }),
    );
    close(full.value.annualized, "0.373362535", "1e-8");
  });

  it("usa el valor inicial cuando se indica", () => {
    const r = ok(
      xirr({
        startValue: point("2026-01-01", 1000),
        flows: [],
        endValue: point("2027-01-01", 1100),
      }),
    );
    close(r.value.annualized, "0.1");
  });

  it("agrega los flujos del mismo día", () => {
    const joined = ok(
      xirr({
        flows: [flow("2026-01-01", 600), flow("2026-01-01", 400)],
        endValue: point("2027-01-01", 1100),
      }),
    );
    close(joined.value.annualized, "0.1");
  });

  it("menos de un año: devuelve la acumulada y marca la anualizada como poco fiable", () => {
    const r = ok(xirr({ flows: [flow("2026-01-01", 1000)], endValue: point("2026-01-31", 1020) }));
    expect(r.value.annualizedReliable).toBe(false);
    close(r.value.cumulative, "0.02");
    close(r.value.annualized, annualize(dec("0.02"), 30).toString(), "1e-9");
  });

  it("tasa cero cuando el valor final es lo aportado", () => {
    const r = ok(xirr({ flows: [flow("2026-01-01", 500)], endValue: point("2026-07-01", 500) }));
    close(r.value.annualized, "0");
  });

  it("perderlo todo es −100 % sin resolver nada", () => {
    const r = ok(xirr({ flows: [flow("2026-01-01", 1000)], endValue: point("2026-06-01", 0) }));
    expect(r.value.annualized.toString()).toBe("-1");
    expect(r.explanation.solver).toBe("total_loss");
    close(r.value.cumulative, "-1");
  });

  it("errores esperables: sin flujos, mismo signo, sin raíz", () => {
    expect(code(xirr({ flows: [], endValue: point("2026-01-01", 0) }))).toBe("returns.no_flows");
    expect(code(xirr({ flows: [], endValue: point("2026-01-01", 10) }))).toBe("returns.same_sign");
    expect(
      code(
        xirr({
          flows: [flow("2026-01-01", 1000), flow("2027-01-01", -3000), flow("2028-01-01", 3000)],
          endValue: point("2028-01-01", 0),
        }),
      ),
    ).toBe("returns.no_convergence");
  });

  it("avisa de varias raíces y devuelve una de ellas (10 % o 20 %)", () => {
    const r = ok(
      xirr({
        flows: [flow("2026-01-01", 1000), flow("2027-01-01", -2300), flow("2028-01-01", 1320)],
        endValue: point("2028-01-01", 0),
      }),
    );
    expect(r.explanation.quality.level).toBe("approximate");
    expect(r.explanation.quality.notes).toEqual([{ code: "returns.xirr_multiple_roots" }]);
    const rate = r.value.annualized;
    expect(rate.minus("0.1").abs().lt("1e-8") || rate.minus("0.2").abs().lt("1e-8")).toBe(true);
  });

  it("si Newton se sale de rango, recurre a la bisección", () => {
    const r = ok(
      xirr(
        { flows: [flow("2026-01-01", 1000)], endValue: point("2027-01-01", 1100) },
        { initialGuess: dec("5") },
      ),
    );
    expect(r.explanation.solver).toBe("bisection");
    close(r.value.annualized, "0.1", "1e-9");
  });

  it("amplía el techo de la bisección para rentabilidades enormes", () => {
    const r = ok(
      xirr(
        { flows: [flow("2026-01-01", 1000)], endValue: point("2026-01-11", 2000) },
        { initialGuess: dec("1e13") },
      ),
    );
    expect(r.explanation.solver).toBe("bisection");
    close(r.value.annualized, annualize(dec("1"), 10).toString(), "1");
  });

  it("propaga los errores de periodo y no mezcla monedas", () => {
    expect(code(xirr({ flows: [flow("2027-02-01", 1)], endValue: point("2027-01-01", 1) }))).toBe(
      "returns.flow_outside_period",
    );
    expect(() =>
      xirr({
        flows: [flow("2026-01-01", 1)],
        endValue: { date: d("2027-01-01"), value: money(1n, "USD") },
      }),
    ).toThrow(CurrencyMismatchError);
  });
});

describe("twr", () => {
  it("un tramo sin flujos: 1.000 → 1.100 en un año es un 10 %", () => {
    const r = ok(
      twr({ valuations: [point("2026-01-01", 1000), point("2027-01-01", 1100)], flows: [] }),
    );
    close(r.value.cumulative, "0.1");
    close(r.value.annualized, "0.1");
    expect(r.value.annualizedReliable).toBe(true);
    expect(r.value.segments).toHaveLength(1);
    expect(r.explanation.quality.level).toBe("complete");
  });

  it("encadena tramos y no depende de cuánto se aporta (flujo en la fecha de valoración)", () => {
    const r = ok(
      twr({
        valuations: [
          point("2027-01-01", 2310),
          point("2026-01-01", 1000),
          point("2026-07-01", 2100),
        ],
        flows: [flow("2026-07-01", 1000)],
      }),
    );
    close(r.value.cumulative, "0.21");
    expect(r.value.segments.every((s) => s.exact)).toBe(true);
    expect(r.value.segments[0]?.netFlow).toEqual(eur(1000));
    expect(r.explanation.quality.level).toBe("complete");
  });

  it("con un flujo dentro del tramo usa Dietz modificado y lo marca como aproximado", () => {
    const r = ok(
      twr({
        valuations: [point("2026-01-01", 1000), point("2027-01-01", 2200)],
        flows: [flow("2026-07-02", 1000)],
      }),
    );
    // w = (365 − 182) / 365; R = 200 / (1000 + 1000·w)
    const expected = dec("200").div(dec("1000").plus(dec("1000").mul(183).div(365)));
    close(r.value.cumulative, expected.toString());
    expect(r.value.segments[0]?.exact).toBe(false);
    expect(r.explanation.quality.level).toBe("approximate");
    expect(r.explanation.quality.notes).toEqual([
      { code: "returns.twr_dietz_approximation", params: { from: "2026-01-01", to: "2027-01-01" } },
    ]);
  });

  it("ignora los flujos del día de la primera valoración (ya están en ella)", () => {
    const r = ok(
      twr({
        valuations: [point("2026-01-01", 1000), point("2027-01-01", 1100)],
        flows: [flow("2026-01-01", 1000)],
      }),
    );
    close(r.value.cumulative, "0.1");
  });

  it("una cuenta que se vacía y se vuelve a llenar no rompe el cálculo", () => {
    const r = ok(
      twr({
        valuations: [point("2026-01-01", 1000), point("2026-06-01", 0), point("2026-12-01", 500)],
        flows: [flow("2026-06-01", -1000), flow("2026-12-01", 500)],
      }),
    );
    close(r.value.cumulative, "0");
    expect(r.value.segments).toHaveLength(2);
  });

  it("un tramo sin base (empieza en cero y gana) se salta y el resultado es parcial", () => {
    const r = ok(
      twr({
        valuations: [point("2026-01-01", 0), point("2026-02-01", 100), point("2026-03-01", 110)],
        flows: [],
      }),
    );
    close(r.value.cumulative, "0.1");
    expect(r.value.segments).toHaveLength(1);
    expect(r.explanation.quality.level).toBe("partial");
    expect(r.explanation.quality.notes[0]?.code).toBe("returns.twr_segment_skipped");
  });

  it("si ningún tramo es calculable, falla con un código explicado", () => {
    expect(
      code(twr({ valuations: [point("2026-01-01", 0), point("2026-02-01", 100)], flows: [] })),
    ).toBe("returns.twr_no_computable_segments");
  });

  it("errores de entrada", () => {
    expect(code(twr({ valuations: [point("2026-01-01", 1)], flows: [] }))).toBe(
      "returns.insufficient_valuations",
    );
    expect(
      code(twr({ valuations: [point("2026-01-01", 1), point("2026-01-01", 2)], flows: [] })),
    ).toBe("returns.duplicate_valuation_date");
    const two = [point("2026-01-01", 1), point("2026-02-01", 2)];
    expect(code(twr({ valuations: two, flows: [flow("2025-12-31", 1)] }))).toBe(
      "returns.flow_outside_period",
    );
    expect(code(twr({ valuations: two, flows: [flow("2026-02-02", 1)] }))).toBe(
      "returns.flow_outside_period",
    );
    expect(() =>
      twr({
        valuations: two,
        flows: [{ date: d("2026-01-15"), amount: money(1n, "USD") }],
      }),
    ).toThrow(CurrencyMismatchError);
  });
});

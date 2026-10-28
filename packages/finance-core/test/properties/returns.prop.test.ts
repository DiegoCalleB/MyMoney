import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarDate,
  contributedVsGained,
  cpiPoint,
  dec,
  money,
  realReturn,
  twr,
  xirr,
} from "../../src";

const RUNS = { numRuns: 1000 };
const start = calendarDate("2026-01-01");
const eur = (minor: bigint) => money(minor, "EUR");

/** Aportación única y valor final que sale de aplicar `rate` durante `days`. */
const scenario = fc.record({
  contribution: fc.integer({ min: 10_000_000, max: 900_000_000 }),
  rate: fc.double({ min: -0.5, max: 1, noNaN: true }),
  days: fc.integer({ min: 30, max: 1500 }),
  scale: fc.integer({ min: 1, max: 1000 }),
});

function endFor(s: { contribution: number; rate: number; days: number }): bigint {
  const grown = dec(String(s.contribution)).mul(
    dec(String(1 + s.rate)).pow(dec(String(s.days)).div(365)),
  );
  return BigInt(grown.toFixed(0));
}

describe("propiedades de la rentabilidad", () => {
  it("XIRR devuelve la tasa con la que se construyó el valor final", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const r = xirr({
          flows: [{ date: start, amount: eur(BigInt(s.contribution)) }],
          endValue: { date: addDays(start, s.days), value: eur(endFor(s)) },
        });
        expect(r.ok).toBe(true);
        if (r.ok)
          expect(r.value.value.annualized.minus(String(s.rate)).abs().lt("1e-5")).toBe(true);
      }),
      RUNS,
    );
  });

  it("XIRR no cambia al multiplicar todos los importes por una constante", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const build = (k: bigint) =>
          xirr({
            flows: [{ date: start, amount: eur(BigInt(s.contribution) * k) }],
            endValue: { date: addDays(start, s.days), value: eur(endFor(s) * k) },
          });
        const a = build(1n);
        const b = build(BigInt(s.scale));
        expect(a.ok && b.ok).toBe(true);
        if (a.ok && b.ok) {
          expect(a.value.value.annualized.minus(b.value.value.annualized).abs().lt("1e-8")).toBe(
            true,
          );
        }
      }),
      RUNS,
    );
  });

  it("sin flujos intermedios, TWR y XIRR dan la misma tasa anual", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const end = { date: addDays(start, s.days), value: eur(endFor(s)) };
        const open = { date: start, value: eur(BigInt(s.contribution)) };
        const t = twr({ valuations: [open, end], flows: [] });
        const x = xirr({ startValue: open, flows: [], endValue: end });
        expect(t.ok && x.ok).toBe(true);
        if (t.ok && x.ok) {
          expect(t.value.value.annualized.minus(x.value.value.annualized).abs().lt("1e-7")).toBe(
            true,
          );
        }
      }),
      RUNS,
    );
  });

  it("TWR no depende del importe de la aportación intermedia", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100_000_000, max: 900_000_000 }),
        fc.integer({ min: 0, max: 900_000_000 }),
        fc.double({ min: -0.4, max: 0.8, noNaN: true }),
        fc.double({ min: -0.4, max: 0.8, noNaN: true }),
        (v0, contribution, r1, r2) => {
          const afterFlow = BigInt(
            dec(String(v0))
              .mul(String(1 + r1))
              .plus(contribution)
              .toFixed(0),
          );
          const end = BigInt(
            dec(afterFlow.toString())
              .mul(String(1 + r2))
              .toFixed(0),
          );
          const mid = addDays(start, 180);
          const result = twr({
            valuations: [
              { date: start, value: eur(BigInt(v0)) },
              { date: mid, value: eur(afterFlow) },
              { date: addDays(start, 365), value: eur(end) },
            ],
            flows: [{ date: mid, amount: eur(BigInt(contribution)) }],
          });
          expect(result.ok).toBe(true);
          if (result.ok) {
            const expected = dec(String(1 + r1))
              .mul(String(1 + r2))
              .minus(1);
            expect(result.value.value.cumulative.minus(expected).abs().lt("1e-6")).toBe(true);
          }
        },
      ),
      RUNS,
    );
  });

  it("aportar y ganar justo esa cantidad más no cambia la ganancia", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        fc.bigInt({ min: -(10n ** 11n), max: 10n ** 11n }),
        (opening, extra, end) => {
          const make = (flows: bigint[], endValue: bigint) =>
            contributedVsGained({
              startValue: { date: start, value: eur(opening) },
              flows: flows.map((f, i) => ({ date: addDays(start, i + 1), amount: eur(f) })),
              endValue: { date: addDays(start, 10), value: eur(endValue) },
            });
          const a = make([], opening + end);
          const b = make([extra], opening + end + extra);
          expect(a.ok && b.ok).toBe(true);
          if (a.ok && b.ok) expect(a.value.value.gain).toEqual(b.value.value.gain);
        },
      ),
      RUNS,
    );
  });

  it("con un IPC plano la real es la nominal, y si nominal = inflación la real es cero", () => {
    fc.assert(
      fc.property(fc.double({ min: -0.9, max: 5, noNaN: true }), (nominal) => {
        const flat = realReturn({
          nominalCumulative: dec(String(nominal)),
          from: start,
          to: addDays(start, 100),
          cpi: ["01", "02", "03", "04", "05"].map((m) => cpiPoint(`2026-${m}`, "100")),
        });
        expect(flat.ok).toBe(true);
        if (flat.ok) {
          expect(flat.value.value.cumulative.real.minus(String(nominal)).abs().lt("1e-20")).toBe(
            true,
          );
        }
        const same = realReturn({
          nominalCumulative: dec("0.0125"),
          from: start,
          to: calendarDate("2026-02-01"),
          cpi: [
            cpiPoint("2026-01", "100"),
            cpiPoint("2026-02", "101.25"),
            cpiPoint("2026-03", "103"),
          ],
        });
        expect(same.ok && same.value.value.cumulative.real.abs().lt("1e-20")).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { addDays, calendarDate, incomeCalendar, money, type IncomeEvent } from "../../src";

const RUNS = { numRuns: 1000 };
const onDate = calendarDate("2026-10-28");

const events = fc.array(
  fc.record({
    offset: fc.integer({ min: 0, max: 800 }),
    kind: fc.constantFrom("dividend" as const, "interest" as const),
    minor: fc.bigInt({ min: -(10n ** 9n), max: 10n ** 9n }),
  }),
  { maxLength: 30 },
);
const toEvents = (rows: { offset: number; kind: IncomeEvent["kind"]; minor: bigint }[]) =>
  rows.map<IncomeEvent>((r) => ({
    date: addDays(onDate, -r.offset),
    kind: r.kind,
    amount: money(r.minor, "EUR"),
  }));
const go = (rows: Parameters<typeof toEvents>[0], months = 12) => {
  const r = incomeCalendar({
    currency: "EUR",
    events: toEvents(rows),
    months,
    portfolioValue: null,
    onDate,
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value.value;
};

describe("incomeCalendar (propiedades)", () => {
  it("el total del último año suma exactamente los cobros de esos 365 días", () => {
    fc.assert(
      fc.property(events, (rows) => {
        const expected = rows.filter((r) => r.offset <= 364).reduce((acc, r) => acc + r.minor, 0n);
        expect(go(rows).trailingYear.minor).toBe(expected);
      }),
      RUNS,
    );
  });

  it("cada mes es dividendos + intereses", () => {
    fc.assert(
      fc.property(events, (rows) => {
        for (const m of go(rows).months) {
          expect(m.total.minor).toBe(m.dividend.minor + m.interest.minor);
        }
      }),
      RUNS,
    );
  });

  it("el orden de los cobros no cambia nada", () => {
    fc.assert(
      fc.property(events, (rows) => {
        expect(go([...rows].reverse())).toEqual(go(rows));
      }),
      RUNS,
    );
  });

  it("pedir más meses solo añade meses por delante", () => {
    fc.assert(
      fc.property(events, (rows) => {
        const short = go(rows, 6).months;
        const long = go(rows, 18).months;
        expect(long.slice(-6)).toEqual(short);
      }),
      RUNS,
    );
  });
});

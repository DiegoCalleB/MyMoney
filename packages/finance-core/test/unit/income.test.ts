import { describe, expect, it } from "vitest";
import { calendarDate, incomeCalendar, money, type IncomeEvent } from "../../src";

const d = calendarDate;
const eur = (minor: bigint) => money(minor, "EUR");
const event = (date: string, kind: IncomeEvent["kind"], minor: bigint): IncomeEvent => ({
  date: d(date),
  kind,
  amount: eur(minor),
});
const run = (
  events: IncomeEvent[],
  months = 12,
  portfolio: bigint | null = null,
  on = "2026-10-28",
) => {
  const r = incomeCalendar({
    currency: "EUR",
    events,
    months,
    portfolioValue: portfolio === null ? null : eur(portfolio),
    onDate: d(on),
  });
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};

describe("incomeCalendar", () => {
  const events = [
    event("2025-10-27", "dividend", 999n), // fuera del último año (365 días)
    event("2025-10-30", "dividend", 1000n),
    event("2026-03-15", "interest", 250n),
    event("2026-03-20", "dividend", 500n),
    event("2026-10-05", "interest", 100n),
    event("2026-11-01", "dividend", 7777n), // futuro: no cuenta
  ];

  it("desglosa por mes, con los meses vacíos a cero, del más antiguo al actual", () => {
    const r = run(events);
    expect(r.value.months).toHaveLength(12);
    expect(r.value.months[0]?.month).toBe("2025-11");
    expect(r.value.months.at(-1)?.month).toBe("2026-10");
    const march = r.value.months.find((m) => m.month === "2026-03");
    expect(march).toEqual({
      month: "2026-03",
      dividend: eur(500n),
      interest: eur(250n),
      total: eur(750n),
    });
    expect(r.value.months.find((m) => m.month === "2026-05")?.total).toEqual(eur(0n));
  });

  it("calcula el último año (365 días, incluido hoy) por tipo", () => {
    const r = run(events);
    expect(r.value.trailingDividends).toEqual(eur(1500n));
    expect(r.value.trailingInterest).toEqual(eur(350n));
    expect(r.value.trailingYear).toEqual(eur(1850n));
    expect(r.value.nextYearEstimate).toEqual(eur(1850n));
    expect(r.explanation.windowStart).toBe("2025-10-29");
    expect(r.explanation.eventCount).toBe(4);
    expect(r.explanation.caveats).toEqual([
      "income.caveat.estimate_is_not_forecast",
      "income.caveat.no_portfolio_value",
    ]);
  });

  it("la rentabilidad por cobros es cobrado del año / valor de la cartera", () => {
    const r = run(events, 12, 100_000n);
    expect(r.value.trailingYield?.toFixed(4)).toBe("0.0185");
    expect(r.explanation.caveats).toEqual(["income.caveat.estimate_is_not_forecast"]);
  });

  it("sin valor de cartera positivo no hay rentabilidad", () => {
    expect(run(events, 12, 0n).value.trailingYield).toBeNull();
  });

  it("admite correcciones negativas y cruza el cambio de año", () => {
    const r = run(
      [event("2026-01-10", "dividend", 500n), event("2026-01-11", "dividend", -200n)],
      3,
      null,
      "2026-02-15",
    );
    expect(r.value.months.map((m) => m.month)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(r.value.months[1]?.dividend).toEqual(eur(300n));
  });

  it("avisa cuando no hay cobros o la historia es corta", () => {
    expect(run([]).explanation.caveats).toContain("income.caveat.no_events");
    const short = run([event("2026-09-01", "interest", 5n)]);
    expect(short.explanation.caveats).toContain("income.caveat.short_history");
  });

  it("valida los meses y las monedas", () => {
    const base = {
      currency: "EUR" as const,
      events: [],
      portfolioValue: null,
      onDate: d("2026-10-28"),
    };
    for (const months of [0, 61, 1.5]) {
      expect(incomeCalendar({ ...base, months })).toEqual({
        ok: false,
        error: { code: "income.months_invalid" },
      });
    }
    const usd = { date: d("2026-10-01"), kind: "dividend" as const, amount: money(1n, "USD") };
    expect(incomeCalendar({ ...base, months: 12, events: [usd] }).ok).toBe(false);
    expect(incomeCalendar({ ...base, months: 12, portfolioValue: money(1n, "USD") })).toEqual({
      ok: false,
      error: { code: "income.currency_mismatch" },
    });
  });
});

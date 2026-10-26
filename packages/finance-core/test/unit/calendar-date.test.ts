import { describe, expect, it } from "vitest";
import { addDays, calendarDate, compareDates, daysBetween, isCalendarDate } from "../../src";

describe("CalendarDate", () => {
  it("valida fechas reales, incluidos bisiestos", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2025-02-29")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-1-01")).toBe(false);
    expect(isCalendarDate("2026-10-26T00:00:00Z")).toBe(false);
    expect(() => calendarDate("2026-02-30")).toThrow(RangeError);
  });

  it("cuenta días naturales sin verse afectada por cambios de hora", () => {
    // El 25 de octubre de 2026 cambia la hora en España; una fecha de calendario no lo nota.
    expect(daysBetween(calendarDate("2026-10-24"), calendarDate("2026-10-26"))).toBe(2);
    expect(daysBetween(calendarDate("2026-01-01"), calendarDate("2025-01-01"))).toBe(-365);
    expect(daysBetween(calendarDate("2024-01-01"), calendarDate("2025-01-01"))).toBe(366);
  });

  it("suma días cruzando meses y años", () => {
    expect(addDays(calendarDate("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(calendarDate("2024-03-01"), -1)).toBe("2024-02-29");
  });

  it("compara fechas", () => {
    const a = calendarDate("2026-01-01");
    const b = calendarDate("2026-01-02");
    expect(compareDates(a, b)).toBe(-1);
    expect(compareDates(b, a)).toBe(1);
    expect(compareDates(a, a)).toBe(0);
  });
});

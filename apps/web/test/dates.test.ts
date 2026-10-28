import { describe, expect, it } from "vitest";
import { calendarDateInZone } from "@/lib/dates";

describe("calendarDateInZone", () => {
  it("usa la fecha de la zona, no la de UTC", () => {
    const instant = new Date("2026-10-27T23:30:00Z");
    expect(calendarDateInZone(instant, "Europe/Madrid")).toBe("2026-10-28");
    expect(calendarDateInZone(instant, "UTC")).toBe("2026-10-27");
    expect(calendarDateInZone(instant, "America/Mexico_City")).toBe("2026-10-27");
  });

  it("respeta el cambio de hora de octubre en España", () => {
    expect(calendarDateInZone(new Date("2026-10-24T22:30:00Z"), "Europe/Madrid")).toBe(
      "2026-10-25",
    );
    expect(calendarDateInZone(new Date("2026-10-25T22:30:00Z"), "Europe/Madrid")).toBe(
      "2026-10-25",
    );
  });
});

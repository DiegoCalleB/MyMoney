import { describe, expect, it } from "vitest";
import { formatBpsAsPercent, parseShareToBps, parseWholeMonths } from "@/lib/percent";

describe("parseShareToBps", () => {
  it.each([
    ["5", 500],
    ["4,5", 450],
    ["4.05", 405],
    ["0", 0],
    ["100", 10000],
    ["100,00", 10000],
    [" 12,34 ", 1234],
    ["0,05", 5],
  ])("%s → %s", (text, bps) => {
    expect(parseShareToBps(text)).toBe(bps);
  });

  it.each([undefined, "", "abc", "100,01", "101", "-1", "1,234", "1e2", ",5", "5,"])(
    "rechaza %j",
    (text) => {
      expect(parseShareToBps(text)).toBeNull();
    },
  );
});

describe("formatBpsAsPercent", () => {
  it("es la inversa de parseShareToBps", () => {
    for (const bps of [0, 5, 20, 450, 500, 1234, 9999, 10000]) {
      expect(parseShareToBps(formatBpsAsPercent(bps))).toBe(bps);
    }
    expect(formatBpsAsPercent(450)).toBe("4,5");
    expect(formatBpsAsPercent(500)).toBe("5");
    expect(formatBpsAsPercent(5)).toBe("0,05");
  });
});

describe("parseWholeMonths", () => {
  it("solo enteros", () => {
    expect(parseWholeMonths("6")).toBe(6);
    expect(parseWholeMonths(" 120 ")).toBe(120);
    for (const text of [undefined, "", "1,5", "-3", "abc", "1000"]) {
      expect(parseWholeMonths(text)).toBeNull();
    }
  });
});

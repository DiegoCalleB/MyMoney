import { describe, expect, it } from "vitest";
import { isZero, multiply, parseFixed, toMinorUnits } from "../_shared/decimal.ts";

const minor = (a: string, b: string, digits = 2) => {
  const x = parseFixed(a);
  const y = parseFixed(b);
  if (!x || !y) throw new Error("no es un decimal");
  return toMinorUnits(multiply(x, y), digits);
};

describe("parseFixed", () => {
  it("lee enteros y decimales sin signo", () => {
    expect(parseFixed("12")).toEqual({ int: 12n, scale: 0 });
    expect(parseFixed("0.00120")).toEqual({ int: 120n, scale: 5 });
    expect(isZero(parseFixed("0.000") ?? { int: 1n, scale: 0 })).toBe(true);
    expect(isZero(parseFixed("0.001") ?? { int: 0n, scale: 0 })).toBe(false);
  });

  it.each(["", "-1", "1e5", "1,5", ".5", "5.", "abc", "1.2.3", " 1", "1".repeat(31)])(
    "rechaza %j",
    (value) => {
      expect(parseFixed(value)).toBeNull();
    },
  );
});

describe("toMinorUnits (half-even)", () => {
  it("multiplica sin pérdida y redondea al céntimo", () => {
    expect(minor("0.5", "60000.10")).toBe(3000005n);
    expect(minor("2", "3")).toBe(600n);
    expect(minor("0.00000001", "60000")).toBe(0n);
  });

  it("empates al par: 0,005 → 0,00; 0,015 → 0,02; 0,025 → 0,02", () => {
    expect(minor("0.005", "1")).toBe(0n);
    expect(minor("0.015", "1")).toBe(2n);
    expect(minor("0.025", "1")).toBe(2n);
    expect(minor("0.035", "1")).toBe(4n);
  });

  it("redondea hacia arriba y hacia abajo cuando no es empate", () => {
    expect(minor("0.016", "1")).toBe(2n);
    expect(minor("0.014", "1")).toBe(1n);
  });

  it("con menos decimales que las unidades mínimas amplía la escala", () => {
    expect(minor("1.5", "1")).toBe(150n);
    expect(toMinorUnits({ int: 7n, scale: 0 }, 2)).toBe(700n);
    expect(toMinorUnits({ int: 7n, scale: 0 }, 0)).toBe(7n);
  });
});

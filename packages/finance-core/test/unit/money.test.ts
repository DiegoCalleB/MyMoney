import { describe, expect, it } from "vitest";
import {
  CurrencyMismatchError,
  add,
  allocate,
  compare,
  dec,
  fromDecimal,
  isCurrencyCode,
  isZero,
  money,
  negate,
  parseAmount,
  sub,
  sum,
  toDecimal,
  zero,
} from "../../src";

const eur = (minor: bigint) => money(minor, "EUR");

describe("operaciones con Money", () => {
  it("suma y resta sin coma flotante (0,10 + 0,20 = 0,30 exacto)", () => {
    expect(add(eur(10n), eur(20n))).toEqual(eur(30n));
    expect(sub(eur(10n), eur(20n))).toEqual(eur(-10n));
  });

  it("impide mezclar monedas", () => {
    expect(() => add(eur(1n), money(1n, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => compare(eur(1n), money(1n, "USD"))).toThrow(/EUR y USD/);
  });

  it("negate, isZero, compare, sum y zero", () => {
    expect(negate(eur(5n))).toEqual(eur(-5n));
    expect(isZero(zero("EUR"))).toBe(true);
    expect(isZero(eur(1n))).toBe(false);
    expect(compare(eur(1n), eur(2n))).toBe(-1);
    expect(compare(eur(2n), eur(1n))).toBe(1);
    expect(compare(eur(2n), eur(2n))).toBe(0);
    expect(sum([], "EUR")).toEqual(eur(0n));
    expect(sum([eur(1n), eur(2n), eur(3n)], "EUR")).toEqual(eur(6n));
  });

  it("los importes son inmutables", () => {
    expect(Object.isFrozen(eur(1n))).toBe(true);
  });

  it("reconoce códigos de moneda soportados", () => {
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("XXX")).toBe(false);
    expect(isCurrencyCode("toString")).toBe(false);
  });
});

describe("conversión decimal ↔ unidades mínimas", () => {
  it("respeta los decimales de cada moneda", () => {
    expect(toDecimal(eur(1234n)).toString()).toBe("12.34");
    expect(toDecimal(money(1234n, "JPY")).toString()).toBe("1234");
    expect(toDecimal(money(1234n, "KWD")).toString()).toBe("1.234");
  });

  it("redondea solo una vez, con el modo indicado", () => {
    expect(fromDecimal(dec("0.125"), "EUR")).toEqual(eur(12n)); // HALF_EVEN por defecto
    expect(fromDecimal(dec("0.135"), "EUR")).toEqual(eur(14n));
    expect(fromDecimal(dec("0.125"), "EUR", "HALF_UP")).toEqual(eur(13n));
    expect(fromDecimal(dec("-0.125"), "EUR", "HALF_UP")).toEqual(eur(-13n));
    expect(fromDecimal(dec("99.5"), "JPY", "HALF_UP")).toEqual(money(100n, "JPY"));
  });

  it("maneja importes enormes sin perder precisión", () => {
    const big = 123456789012345678901234567n;
    expect(fromDecimal(toDecimal(eur(big)), "EUR")).toEqual(eur(big));
  });
});

describe("parseAmount", () => {
  it.each([
    ["1.234,56", ",", 123456n],
    ["-12,5", ",", -1250n],
    ["1 234,00", ",", 123400n],
    ["1,234.56", ".", 123456n],
    ["+7", ".", 700n],
  ] as const)("%s con separador %s → %s", (text, sep, expected) => {
    expect(parseAmount(text, "EUR", sep)).toEqual(eur(expected));
  });

  it("rechaza texto no numérico y más decimales de los que admite la moneda", () => {
    expect(parseAmount("abc", "EUR", ",")).toBeNull();
    expect(parseAmount("1,234", "EUR", ",")).toBeNull();
    expect(parseAmount("12,5", "JPY", ",")).toBeNull();
    expect(parseAmount("", "EUR", ",")).toBeNull();
  });
});

describe("allocate", () => {
  it("reparte 100,00 € entre tres sin perder céntimos", () => {
    expect(allocate(eur(10000n), [1n, 1n, 1n])).toEqual([eur(3334n), eur(3333n), eur(3333n)]);
  });

  it("reparte por titularidad en puntos básicos (60 % / 40 %)", () => {
    expect(allocate(eur(101n), [6000n, 4000n])).toEqual([eur(61n), eur(40n)]);
  });

  it("reparte importes negativos simétricamente", () => {
    expect(allocate(eur(-10000n), [1n, 1n, 1n])).toEqual([eur(-3334n), eur(-3333n), eur(-3333n)]);
  });

  it("admite pesos cero", () => {
    expect(allocate(eur(5n), [0n, 1n])).toEqual([eur(0n), eur(5n)]);
  });

  it("valida los pesos", () => {
    expect(() => allocate(eur(1n), [])).toThrow(RangeError);
    expect(() => allocate(eur(1n), [-1n, 2n])).toThrow(RangeError);
    expect(() => allocate(eur(1n), [0n, 0n])).toThrow(RangeError);
  });
});

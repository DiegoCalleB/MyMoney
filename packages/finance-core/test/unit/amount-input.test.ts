import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MINOR_UNITS,
  money,
  parseLocalizedAmount,
  parsePercentBps,
  toDecimal,
  type CurrencyCode,
} from "../../src";

const eur = (text: string) => parseLocalizedAmount(text, "EUR");

describe("parseLocalizedAmount", () => {
  it.each([
    ["1.234,56", 123456n],
    ["1234,56", 123456n],
    ["1234,5", 123450n],
    ["0,05", 5n],
    ["1.234", 123400n],
    ["12.345.678", 1234567800n],
    ["1234", 123400n],
    ["12.5", 1250n],
    ["1234.56", 123456n],
    ["-12,30", -1230n],
    ["+7", 700n],
    [" 1 234,56 ", 123456n],
    ["1 234,56", 123456n],
  ])("lee %s", (text, minor) => {
    expect(eur(text)).toEqual(money(minor, "EUR"));
  });

  it.each([
    "",
    "abc",
    "1,2,3",
    "1.23.4",
    "12.3456",
    "1,234.56",
    "1.2345,6",
    "1.234,5,6",
    "--5",
    "12e3",
    "1,567",
    "1.234.56",
  ])("rechaza %s en lugar de adivinar", (text) => {
    expect(eur(text)).toBeNull();
  });

  it("respeta los decimales de la moneda", () => {
    expect(parseLocalizedAmount("1.234", "JPY")).toEqual(money(1234n, "JPY"));
    expect(parseLocalizedAmount("1,5", "JPY")).toBeNull();
    expect(parseLocalizedAmount("1,234", "KWD")).toEqual(money(1234n, "KWD"));
  });

  it("nunca multiplica por 100 en silencio un importe con punto decimal", () => {
    expect(eur("1234.56")).toEqual(money(123456n, "EUR"));
    expect(eur("1234.5")).toEqual(money(123450n, "EUR"));
  });

  it("es la inversa de escribir con coma y miles con punto", () => {
    const currencies = Object.keys(MINOR_UNITS) as CurrencyCode[];
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 12n }),
        fc.constantFrom(...currencies),
        (minor, currency) => {
          const amount = money(minor, currency);
          const fixed = toDecimal(amount).toFixed(MINOR_UNITS[currency]);
          const [whole = "0", fraction] = fixed.split(".");
          const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
          const text = fraction === undefined ? grouped : `${grouped},${fraction}`;
          expect(parseLocalizedAmount(text, currency)).toEqual(amount);
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe("parsePercentBps", () => {
  it.each([
    ["60", 6000],
    ["12,5", 1250],
    ["33,33", 3333],
    ["0", 0],
    ["100", 10_000],
    [" 7 ", 700],
    ["12.5", 1250],
  ])("%s → %s pb", (text, bps) => {
    expect(parsePercentBps(text)).toBe(bps);
  });

  it.each(["", "abc", "-1", "100,01", "101", "12,345", "1.000"])("rechaza %j", (text) => {
    expect(parsePercentBps(text)).toBeNull();
  });
});

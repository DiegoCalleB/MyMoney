import { describe, expect, it } from "vitest";
import { dec, money } from "@mymoney/finance-core";
import { bpsToInputText, formatMoney, formatPercent, formatShare } from "@/lib/format";

const plain = (s: string) => s.replace(/\s/g, " ");

describe("formatMoney", () => {
  it("formatea en español con la moneda y sus decimales", () => {
    expect(plain(formatMoney(money(123456n, "EUR")))).toBe("1.234,56 €");
    expect(plain(formatMoney(money(123456789n, "EUR")))).toBe("1.234.567,89 €");
    expect(plain(formatMoney(money(1234n, "JPY")))).toBe("1.234 JPY");
    expect(plain(formatMoney(money(5n, "EUR")))).toBe("0,05 €");
  });

  it("muestra el signo de los negativos", () => {
    expect(plain(formatMoney(money(-5000n, "EUR")))).toBe("-50,00 €");
  });

  it("no pierde precisión con importes grandes", () => {
    expect(plain(formatMoney(money(999999999999999n, "EUR")))).toBe("9.999.999.999.999,99 €");
  });
});

describe("formatPercent", () => {
  it("formatea con dos decimales y signo", () => {
    expect(plain(formatPercent(dec("0.1")))).toBe("+10,00 %");
    expect(plain(formatPercent(dec("-0.0534")))).toBe("-5,34 %");
    expect(plain(formatPercent(dec("0")))).toBe("0,00 %");
  });
});

describe("formatShare", () => {
  it("formatea puntos básicos como porcentaje sin signo", () => {
    expect(plain(formatShare(5000))).toBe("50 %");
    expect(plain(formatShare(3750))).toBe("37,5 %");
    expect(plain(formatShare(0))).toBe("0 %");
  });
});

describe("bpsToInputText", () => {
  it("escribe los puntos básicos como porcentaje con coma", () => {
    expect(bpsToInputText(6000)).toBe("60");
    expect(bpsToInputText(1250)).toBe("12,5");
    expect(bpsToInputText(305)).toBe("3,05");
    expect(bpsToInputText(0)).toBe("0");
    expect(bpsToInputText(10_000)).toBe("100");
  });
});

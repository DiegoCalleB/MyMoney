import { describe, expect, it } from "vitest";
import { dec, money } from "@mymoney/finance-core";
import { formatMoney, formatPercentSigned } from "@/lib/format";

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

describe("formatPercentSigned", () => {
  it("lleva signo explícito y un decimal", () => {
    expect(plain(formatPercentSigned(dec("0.1234")))).toBe("+12,3 %");
    expect(plain(formatPercentSigned(dec("-0.05")))).toBe("-5,0 %");
    expect(plain(formatPercentSigned(dec("0")))).toBe("0,0 %");
  });
});

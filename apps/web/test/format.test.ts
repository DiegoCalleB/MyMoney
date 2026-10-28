import { describe, expect, it } from "vitest";
import { dec, money } from "@mymoney/finance-core";
import { formatMoney, formatPercentSigned, formatShare } from "@/lib/format";

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

describe("formatShare", () => {
  it("da el peso sobre el total con un decimal, sin pasar por coma flotante", () => {
    const whole = money(158_616_51n, "EUR");
    expect(plain(formatShare(money(73_717_49n, "EUR"), whole))).toBe("46,5 %");
    expect(plain(formatShare(whole, whole))).toBe("100,0 %");
    expect(plain(formatShare(money(0n, "EUR"), whole))).toBe("0,0 %");
  });

  it("vacío si no hay total positivo o la parte es negativa", () => {
    expect(formatShare(money(1n, "EUR"), money(0n, "EUR"))).toBe("");
    expect(formatShare(money(-5n, "EUR"), money(100n, "EUR"))).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { dec, money } from "@mymoney/finance-core";
import { formatMoney, formatPercent } from "@/lib/format";

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

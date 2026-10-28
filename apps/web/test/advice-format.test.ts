import type { Finding } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { adviceParams } from "@/server/advice-format";

const finding = (params: Record<string, string>): Finding => ({
  ruleId: "x",
  version: 1,
  level: 2,
  severity: "info",
  messageKey: "advice.x",
  params,
  confidence: "high",
  inputsUsed: [],
  assumptionsUsed: [],
});

describe("adviceParams", () => {
  it("da formato a porcentajes, meses e importes", () => {
    const out = adviceParams(
      finding({
        shareBps: "4650",
        limitBps: "4000",
        months: "49.1",
        expense: "150000",
        limitMonths: "12",
        count: "2",
      }),
      "EUR",
    );
    expect(out.share?.replace(/\s/g, " ")).toBe("46,5 %");
    expect(out.limit).toBe("12");
    expect(out.months).toBe("49,1");
    expect(out.expense?.replace(/\s/g, " ")).toBe("1.500,00 €");
    expect(out.count).toBe("2");
    const pct = adviceParams(finding({ limitBps: "4000" }), "EUR");
    expect(pct.limit?.replace(/\s/g, " ")).toBe("40 %");
  });
});

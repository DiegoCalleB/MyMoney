import type { Finding } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
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

describe("textos de los avisos nuevos", () => {
  it("el tope especulativo y las operaciones vencidas se redactan con sus parámetros", () => {
    const cap = adviceParams(finding({ shareBps: "700", limitBps: "500" }), "EUR");
    const text = t("advice.speculative_cap", cap).replace(/\s/g, " ");
    expect(text).toContain("el 7 % de tu patrimonio");
    expect(text).toContain("el 5 % que tú fijaste");
    expect(text).not.toContain("{");

    const due = adviceParams(finding({ count: "2", days: "10" }), "EUR");
    const dueText = t("advice.planned_due", due);
    expect(dueText).toContain("2 operaciones planificadas");
    expect(dueText).toContain("10 días de retraso");
    expect(dueText).not.toContain("{");
  });
});

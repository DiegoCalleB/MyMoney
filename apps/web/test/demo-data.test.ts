import { calendarDate } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { isMessageKey } from "@/lib/i18n";
import { DEMO_TODAY, buildDemoHome } from "@/server/demo-data";

describe("datos de la demo", () => {
  const data = buildDemoHome(DEMO_TODAY);

  it("suma un patrimonio positivo sin cuentas excluidas", () => {
    expect(data.result.value.total.minor).toBeGreaterThan(0n);
    const { total, assets, liabilities } = data.result.value;
    expect(liabilities.minor).toBeGreaterThan(0n);
    expect(total.minor).toBe(assets.minor - liabilities.minor);
    expect(data.result.explanation.quality.excluded).toEqual([]);
    expect(data.result.explanation.accounts).toHaveLength(6);
    expect(data.result.value.byPocket).toHaveLength(2);
  });

  it("todos los supuestos y avisos que se muestran tienen su texto en el catálogo", () => {
    for (const code of data.result.explanation.assumptions)
      expect(isMessageKey(code), code).toBe(true);
    for (const finding of data.findings) expect(isMessageKey(finding.messageKey)).toBe(true);
  });

  it("enseña la evolución de un año, creciente de principio a fin", () => {
    expect(data.history.length).toBeGreaterThanOrEqual(13);
    const first = data.history[0]?.total.minor ?? 0n;
    const last = data.history.at(-1)?.total.minor ?? 0n;
    expect(last).toBeGreaterThan(first);
  });

  it("dispara avisos de ejemplo: colchón alto con dinero sin destino y concentración", () => {
    const ids = data.findings.map((f) => f.messageKey);
    expect(ids).toContain("advice.runway_high");
    expect(ids).toContain("advice.concentration_institution");
    const runway = data.findings.find((f) => f.messageKey === "advice.runway_high");
    expect(BigInt(runway?.params.excess ?? "0")).toBeGreaterThan(0n);
  });

  it("calcula la rentabilidad de la cartera y del plan", () => {
    expect(data.returns.accounts.length).toBe(2);
    expect(data.returns.total?.value.gain.minor).toBeGreaterThan(0n);
  });

  it("funciona con cualquier fecha de hoy y es una función pura", () => {
    const other = buildDemoHome(calendarDate("2027-03-05"));
    expect(other.history.at(-1)?.date).toBe("2027-03-05");
    expect(buildDemoHome(DEMO_TODAY).result.value.total).toEqual(data.result.value.total);
  });

  it("no usa nombres reales: todo es ficticio", () => {
    const names = [...data.accounts.values()]
      .map((a) => a.name)
      .concat([...data.institutions.values()]);
    expect(names.every((n) => !/ing\b|trade republic|santander|bbva/i.test(n))).toBe(true);
  });
});

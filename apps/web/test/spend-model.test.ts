import { calendarDate, money } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { buildMonth, parseMonth, shiftMonth, summarizeMonth } from "@/server/spend-model";

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const labels = { uncategorized: "Sin categoría", other: "Otros" };

describe("meses", () => {
  it("calcula el primer y el último día, también en febrero y en diciembre", () => {
    expect(buildMonth("2026-10")).toMatchObject({
      from: calendarDate("2026-10-01"),
      to: calendarDate("2026-10-31"),
    });
    expect(buildMonth("2026-12").to).toBe(calendarDate("2026-12-31"));
    expect(buildMonth("2028-02").to).toBe(calendarDate("2028-02-29"));
    expect(buildMonth("2027-02").to).toBe(calendarDate("2027-02-28"));
  });

  it("solo acepta meses válidos", () => {
    expect(parseMonth("2026-10")?.key).toBe("2026-10");
    for (const bad of [undefined, "", "2026-13", "2026-00", "26-10", "2026-1", "2026-10-01"]) {
      expect(parseMonth(bad)).toBeNull();
    }
  });

  it("desplaza meses cruzando el año", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -11)).toBe("2025-11");
    expect(shiftMonth("2026-10", 0)).toBe("2026-10");
  });
});

describe("summarizeMonth", () => {
  const names = new Map([
    [ID(1), "Alimentación"],
    [ID(2), "Transporte"],
  ]);
  const row = (
    id: number | null,
    flow: "income" | "expense",
    minor: bigint,
    currency = "EUR" as const,
  ) => ({
    category_id: id === null ? null : ID(id),
    flow,
    currency,
    amount_minor: minor,
  });

  it("suma gastos e ingresos, calcula el ahorro y ordena las categorías con su porcentaje", () => {
    const s = summarizeMonth(
      [
        row(1, "expense", 70_00n),
        row(2, "expense", 30_00n),
        row(null, "expense", 0n),
        row(9, "income", 500_00n),
      ],
      names,
      "EUR",
      labels,
    );
    expect(s.expense).toEqual(money(100_00n, "EUR"));
    expect(s.income).toEqual(money(500_00n, "EUR"));
    expect(s.saved).toEqual(money(400_00n, "EUR"));
    expect(s.categories.map((c) => [c.label, c.shareBps])).toEqual([
      ["Alimentación", 7000],
      ["Transporte", 3000],
    ]);
    expect(s.slices.map((x) => x.label)).toEqual(["Alimentación", "Transporte"]);
  });

  it("el reembolso resta de su categoría y una categoría en negativo no se dibuja", () => {
    const s = summarizeMonth(
      [row(1, "expense", 20_00n), row(2, "expense", -5_00n)],
      names,
      "EUR",
      labels,
    );
    expect(s.expense).toEqual(money(15_00n, "EUR"));
    expect(s.categories.map((c) => c.label)).toEqual(["Alimentación"]);
  });

  it("las monedas distintas de la base no se mezclan; sin categoría usa su etiqueta", () => {
    const s = summarizeMonth(
      [
        row(null, "expense", 10_00n),
        row(1, "expense", 99_00n, "USD" as never),
        row(3, "expense", 10_00n),
      ],
      names,
      "EUR",
      labels,
    );
    expect(s.expense).toEqual(money(20_00n, "EUR"));
    expect(s.categories.map((c) => c.label)).toEqual(["Sin categoría", "Sin categoría"]);
  });

  it("sin datos devuelve ceros y listas vacías", () => {
    const s = summarizeMonth([], names, "EUR", labels);
    expect(s.expense).toEqual(money(0n, "EUR"));
    expect(s.categories).toEqual([]);
    expect(s.slices).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isCalendarDate, isCurrencyCode, parseLocalizedAmount } from "@mymoney/finance-core";
import { ACCOUNT_KINDS } from "@mymoney/schemas";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../supabase/seed/hogar-referencia/${file}`, import.meta.url)),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split(";"));

describe("semilla ficticia del hogar de referencia", () => {
  const [header, ...rows] = read("cuentas.csv");

  it("tiene la cabecera esperada y una fila por cuenta con todas sus columnas", () => {
    expect(header).toEqual([
      "cuenta",
      "tipo",
      "moneda",
      "importe",
      "fecha_valor",
      "ambito",
      "aportado",
      "desde",
      "nota",
    ]);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const row of rows) expect(row).toHaveLength(9);
  });

  it("cada cuenta es válida: tipo, moneda, importe, fechas y ámbito", () => {
    for (const [
      name = "",
      kind = "",
      currency = "",
      amount = "",
      valueDate = "",
      scope = "",
      paid = "",
      since = "",
    ] of rows) {
      expect(name.trim()).not.toBe("");
      expect(ACCOUNT_KINDS as readonly string[]).toContain(kind);
      expect(isCurrencyCode(currency)).toBe(true);
      const parsed = isCurrencyCode(currency) ? parseLocalizedAmount(amount, currency) : null;
      expect(parsed, `${name}: importe`).not.toBeNull();
      expect(parsed?.minor ?? 0n).toBeGreaterThan(0n);
      expect(isCalendarDate(valueDate), `${name}: fecha`).toBe(true);
      expect(["household", "external"]).toContain(scope);
      if (paid !== "" && isCurrencyCode(currency)) {
        expect(parseLocalizedAmount(paid, currency), `${name}: aportado`).not.toBeNull();
      }
      if (since !== "")
        expect(isCalendarDate(since) || /^\d{4}$/.test(since), `${name}: desde`).toBe(true);
    }
  });

  it("los nombres no se repiten y hay cuentas del hogar y externas", () => {
    const names = rows.map((r) => r[0]);
    expect(new Set(names).size).toBe(names.length);
    const scopes = new Set(rows.map((r) => r[5]));
    expect(scopes).toEqual(new Set(["household", "external"]));
  });

  it("los supuestos de ingresos y gasto son importes válidos", () => {
    const [head, ...items] = read("ingresos-y-gastos.csv");
    expect(head).toEqual(["clave", "importe_eur", "frecuencia", "nota"]);
    for (const [key = "", amount = "", frequency = ""] of items) {
      expect(key).toMatch(/^[a-z_]+$/);
      expect(parseLocalizedAmount(amount, "EUR")).not.toBeNull();
      expect(["mensual", "anual"]).toContain(frequency);
    }
  });
});

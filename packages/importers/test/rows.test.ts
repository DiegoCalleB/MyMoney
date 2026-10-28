import { money } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import {
  MAX_DESCRIPTION_LENGTH,
  cleanDescription,
  descriptionKey,
  normalizeRows,
  type ColumnMapping,
} from "../src";

const single: ColumnMapping = {
  dateColumn: 0,
  dateFormat: "dmy",
  descriptionColumn: 1,
  amount: { kind: "single", column: 2 },
  balanceColumn: 3,
  numberFormat: "es",
};
const split: ColumnMapping = {
  ...single,
  amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
  balanceColumn: null,
};

describe("normalizeRows (importe único)", () => {
  it("normaliza fecha, concepto, importe con signo y saldo", () => {
    const { rows, errors } = normalizeRows(
      [
        ["27/10/2026", "  Supermercado   Ejemplo ", "-45,30", "1.204,70"],
        ["26/10/2026", "Nómina", "1.500,00", "1.250,00"],
      ],
      single,
      "EUR",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        index: 1,
        date: "2026-10-27",
        description: "Supermercado Ejemplo",
        amount: money(-4530n, "EUR"),
        balanceAfter: money(120470n, "EUR"),
      },
      {
        index: 2,
        date: "2026-10-26",
        description: "Nómina",
        amount: money(150000n, "EUR"),
        balanceAfter: money(125000n, "EUR"),
      },
    ]);
  });

  it("saldo vacío es null y sin columna de concepto queda vacío", () => {
    const { rows } = normalizeRows([["27/10/2026", "x", "5,00", ""]], single, "EUR");
    expect(rows[0]?.balanceAfter).toBeNull();
    const none = normalizeRows(
      [["27/10/2026", "x", "5,00"]],
      { ...single, descriptionColumn: null, balanceColumn: null },
      "EUR",
    );
    expect(none.rows[0]?.description).toBe("");
  });

  it("no descarta en silencio: cada fila mala sale con su posición y código", () => {
    const { rows, errors } = normalizeRows(
      [
        ["27/10/2026", "ok", "1,00", ""],
        ["31/02/2026", "fecha mala", "1,00", ""],
        ["27/10/2026", "importe malo", "abc", ""],
        ["27/10/2026", "sin importe", "", ""],
        ["27/10/2026", "cero", "0,00", ""],
        ["27/10/2026", "enorme", "10000000000000,01", ""],
        ["27/10/2026", "saldo malo", "1,00", "xx"],
        [],
        ["27/10/2026", "corta"],
        ["27/10/2026", "ok otra", "2,00", ""],
      ],
      single,
      "EUR",
    );
    expect(rows.map((r) => r.index)).toEqual([1, 10]);
    expect(errors).toEqual([
      { index: 2, code: "row.date_invalid" },
      { index: 3, code: "row.amount_invalid" },
      { index: 4, code: "row.amount_missing" },
      { index: 5, code: "row.amount_zero" },
      { index: 6, code: "row.amount_too_large" },
      { index: 7, code: "row.balance_invalid" },
      { index: 8, code: "row.too_short" },
      { index: 9, code: "row.too_short" },
    ]);
  });

  it("una fila sin saldo ni concepto en su sitio queda con saldo nulo y concepto vacío", () => {
    const { rows } = normalizeRows([["27/10/2026", "x", "5,00"]], single, "EUR");
    expect(rows[0]?.balanceAfter).toBeNull();
    const far = normalizeRows(
      [["27/10/2026", "x", "5,00"]],
      { ...single, descriptionColumn: 5, balanceColumn: null },
      "EUR",
    );
    expect(far.rows[0]?.description).toBe("");
  });

  it("rechaza importes con más decimales que la moneda", () => {
    const { errors } = normalizeRows([["27/10/2026", "x", "1,234", ""]], single, "EUR");
    expect(errors).toEqual([{ index: 1, code: "row.amount_invalid" }]);
  });
});

describe("normalizeRows (debe y haber)", () => {
  it("el debe resta y el haber suma", () => {
    const { rows, errors } = normalizeRows(
      [
        ["27/10/2026", "recibo", "12,00", ""],
        ["28/10/2026", "ingreso", "", "30,00"],
        ["29/10/2026", "recibo negativo", "-5,00", ""],
      ],
      split,
      "EUR",
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.amount.minor)).toEqual([-1200n, 3000n, -500n]);
  });

  it("errores propios de las dos columnas", () => {
    const { errors } = normalizeRows(
      [
        ["27/10/2026", "ambos", "1,00", "2,00"],
        ["27/10/2026", "ninguno", "", ""],
        ["27/10/2026", "malo", "x", ""],
        ["27/10/2026", "corta", "1,00"],
        ["27/10/2026", "ceros", "0,00", "0,00"],
      ],
      split,
      "EUR",
    );
    expect(errors).toEqual([
      { index: 1, code: "row.amount_ambiguous" },
      { index: 2, code: "row.amount_missing" },
      { index: 3, code: "row.amount_invalid" },
      { index: 4, code: "row.too_short" },
      { index: 5, code: "row.amount_zero" },
    ]);
  });
});

describe("conceptos", () => {
  it("cleanDescription recorta a 200 caracteres y junta espacios", () => {
    expect(cleanDescription("a  b\t\nc")).toBe("a b c");
    expect(cleanDescription("x".repeat(500))).toHaveLength(MAX_DESCRIPTION_LENGTH);
  });
  it("descriptionKey ignora tildes, mayúsculas y espacios", () => {
    expect(descriptionKey("  NÓMINA   Empresa ")).toBe("nomina empresa");
  });
});

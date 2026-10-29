import { describe, expect, it } from "vitest";
import {
  cleanAmount,
  detectMapping,
  isValidMapping,
  normalizeText,
  parseDateCell,
  type ColumnMapping,
} from "../src";

describe("normalizeText", () => {
  it("quita tildes, mayúsculas y espacios repetidos", () => {
    expect(normalizeText("  Fecha   de OPERACIÓN ")).toBe("fecha de operacion");
  });
});

describe("detectMapping", () => {
  it("reconoce un extracto español con importe y saldo", () => {
    const mapping = detectMapping([
      ["Fecha operación", "Fecha valor", "Concepto", "Importe", "Saldo"],
      ["27/10/2026", "27/10/2026", "Supermercado", "-45,30", "1.204,70"],
      ["26/10/2026", "26/10/2026", "Nómina", "1.500,00", "1.250,00"],
    ]);
    expect(mapping).toEqual({
      dateColumn: 0,
      dateFormat: "dmy",
      descriptionColumn: 2,
      amount: { kind: "single", column: 3 },
      balanceColumn: 4,
      numberFormat: "es",
    });
  });

  it("reconoce columnas de debe y haber", () => {
    const mapping = detectMapping([
      ["Fecha", "Descripción", "Debe", "Haber"],
      ["27-10-2026", "Recibo", "12,00", ""],
      ["28-10-2026", "Ingreso", "", "30,00"],
    ]);
    expect(mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amount: { kind: "split", debitColumn: 2, creditColumn: 3 },
      balanceColumn: null,
    });
  });

  it("reconoce cabeceras en inglés, fechas ISO e importes con coma de millar", () => {
    const mapping = detectMapping([
      ["Date", "Description", "Amount"],
      ["2026-10-27", "Coffee", "-3.50"],
      ["2026-10-28", "Salary", "1,500.00"],
    ]);
    expect(mapping).toMatchObject({ dateFormat: "ymd", numberFormat: "en" });
  });

  it("mantiene el formato español si hay comas decimales", () => {
    const mapping = detectMapping([
      ["Fecha", "Importe"],
      ["27/10/2026", "1,50"],
      ["28/10/2026", "1,234.50"],
    ]);
    expect(mapping?.numberFormat).toBe("es");
  });

  it("mezcla de formatos de fecha: gana el más frecuente", () => {
    const mapping = detectMapping([
      ["Fecha", "Importe"],
      ["2026-10-27", "1"],
      ["2026-10-28", "2"],
      ["29/10/2026", "3"],
    ]);
    expect(mapping?.dateFormat).toBe("ymd");
  });

  it("devuelve null si no hay fecha, importe o formato de fecha reconocible", () => {
    expect(detectMapping([])).toBeNull();
    expect(
      detectMapping([
        ["Concepto", "Importe"],
        ["a", "1"],
      ]),
    ).toBeNull();
    expect(
      detectMapping([
        ["Fecha", "Concepto"],
        ["27/10/2026", "a"],
      ]),
    ).toBeNull();
    expect(
      detectMapping([
        ["Fecha", "Importe"],
        ["hoy", "1"],
      ]),
    ).toBeNull();
    expect(
      detectMapping([
        ["Fecha", "Debe"],
        ["27/10/2026", "1"],
      ]),
    ).toBeNull();
    expect(
      detectMapping([
        ["Fecha", "Haber"],
        ["27/10/2026", "1"],
      ]),
    ).toBeNull();
  });

  it("tolera filas de muestra más cortas que la cabecera", () => {
    const mapping = detectMapping([
      ["Fecha", "Concepto", "Importe", "Saldo"],
      ["27/10/2026"],
      ["28/10/2026", "x", "5,00"],
    ]);
    expect(mapping).toMatchObject({ dateColumn: 0, amount: { kind: "single", column: 2 } });
  });

  it("solo con cabecera usa valores por defecto razonables o falla", () => {
    expect(detectMapping([["Fecha", "Importe"]])).toBeNull();
  });
});

describe("isValidMapping", () => {
  const base: ColumnMapping = {
    dateColumn: 0,
    dateFormat: "dmy",
    descriptionColumn: 1,
    amount: { kind: "single", column: 2 },
    balanceColumn: 3,
    numberFormat: "es",
  };
  it("acepta columnas que existen", () => {
    expect(isValidMapping(base, 4)).toBe(true);
    expect(isValidMapping({ ...base, descriptionColumn: null, balanceColumn: null }, 3)).toBe(true);
    expect(
      isValidMapping({ ...base, amount: { kind: "split", debitColumn: 2, creditColumn: 3 } }, 4),
    ).toBe(true);
  });
  it("rechaza columnas fuera de rango, negativas o no enteras", () => {
    expect(isValidMapping(base, 3)).toBe(false);
    expect(isValidMapping({ ...base, dateColumn: -1 }, 4)).toBe(false);
    expect(isValidMapping({ ...base, descriptionColumn: 1.5 }, 4)).toBe(false);
    expect(
      isValidMapping({ ...base, amount: { kind: "split", debitColumn: 2, creditColumn: 9 } }, 4),
    ).toBe(false);
  });
});

describe("parseDateCell", () => {
  it.each([
    ["27/10/2026", "dmy", "2026-10-27"],
    ["7-1-2026", "dmy", "2026-01-07"],
    ["27.10.2026", "dmy", "2026-10-27"],
    ["27/10/2026 13:45:00", "dmy", "2026-10-27"],
    ["2026-10-27", "ymd", "2026-10-27"],
    ["2026/1/7", "ymd", "2026-01-07"],
    ["2026-10-27T13:45:00", "ymd", "2026-10-27"],
  ] as const)("lee %s", (text, format, expected) => {
    expect(parseDateCell(text, format)).toBe(expected);
  });

  it.each([
    ["31/02/2026", "dmy"],
    ["27/13/2026", "dmy"],
    ["27/10/26", "dmy"],
    ["2026-10-27", "dmy"],
    ["27/10/2026", "ymd"],
    ["hoy", "dmy"],
    ["", "ymd"],
  ] as const)("rechaza %s", (text, format) => {
    expect(parseDateCell(text, format)).toBeNull();
  });
});

describe("cleanAmount", () => {
  it("quita símbolos y espacios y deja el signo delante", () => {
    expect(cleanAmount("45,30 €", "es")).toBe("45,30");
    expect(cleanAmount("EUR 45,30", "es")).toBe("45,30");
    expect(cleanAmount("-1.234,56", "es")).toBe("-1.234,56");
    expect(cleanAmount("+12,00", "es")).toBe("12,00");
    expect(cleanAmount("(12,00)", "es")).toBe("-12,00");
    expect(cleanAmount("12,00-", "es")).toBe("-12,00");
    expect(cleanAmount("$ 3.50", "en")).toBe("3.50");
  });
  it("con formato inglés quita las comas de millar", () => {
    expect(cleanAmount("-1,234.56", "en")).toBe("-1234.56");
  });
  it("vacío es null", () => {
    expect(cleanAmount("  ", "es")).toBeNull();
    expect(cleanAmount("€", "es")).toBeNull();
  });
});

describe("parseDateCell con números de serie de Excel", () => {
  it("convierte días desde 1899-12-30 e ignora la hora", () => {
    expect(parseDateCell("45962", "serial")).toBe("2025-11-01");
    expect(parseDateCell("45962.75", "serial")).toBe("2025-11-01");
    expect(parseDateCell(" 61 ", "serial")).toBe("1900-03-01");
    expect(parseDateCell("2958465", "serial")).toBe("9999-12-31");
  });

  it("rechaza lo que no es un día válido", () => {
    for (const text of ["", "abc", "-5", "60", "0", "2958466", "12345678", "1,5", "2026-10-28"]) {
      expect(parseDateCell(text, "serial")).toBeNull();
    }
  });
});

describe("parseDateCell con dmy_serial", () => {
  it("usa la serie si la celda es un número y día-mes-año si es texto", () => {
    expect(parseDateCell("45962", "dmy_serial")).toBe("2025-11-01");
    expect(parseDateCell("01/10/2026 10:00:00", "dmy_serial")).toBe("2026-10-01");
    expect(parseDateCell("basura", "dmy_serial")).toBeNull();
    expect(parseDateCell("5", "dmy_serial")).toBeNull();
  });
});

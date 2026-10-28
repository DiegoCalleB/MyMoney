import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, decodeText, detectDelimiter, parseCsv } from "../src";

const rowsOf = (text: string, delimiter?: ";" | "," | "\t") => {
  const result = parseCsv(text, DEFAULT_LIMITS, delimiter);
  if (!result.ok) throw new Error(result.error.code);
  return result.value.rows;
};

describe("detectDelimiter", () => {
  it("elige el separador más frecuente de la cabecera", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("ignora los separadores entre comillas y las líneas en blanco iniciales", () => {
    expect(detectDelimiter('\n \n"a,b,c,d";e;f')).toBe(";");
    expect(detectDelimiter('"a;b;c",d,e')).toBe(",");
  });
  it("sin separadores o en empate gana el punto y coma", () => {
    expect(detectDelimiter("solo una columna")).toBe(";");
    expect(detectDelimiter("a;b,c")).toBe(";");
    expect(detectDelimiter("")).toBe(";");
  });
  it("solo mira la primera línea con contenido", () => {
    expect(detectDelimiter("a;b\n1,2,3,4,5")).toBe(";");
  });
});

describe("decodeText", () => {
  it("decodifica UTF-8 y quita el BOM", () => {
    expect(decodeText(new TextEncoder().encode("﻿Nómina"))).toBe("Nómina");
    expect(decodeText(new TextEncoder().encode("Nómina"))).toBe("Nómina");
  });
  it("recurre a Windows-1252 si no es UTF-8 válido", () => {
    expect(decodeText(Uint8Array.from([0x4e, 0xf3, 0x6d, 0x69, 0x6e, 0x61]))).toBe("Nómina");
  });
});

describe("parseCsv", () => {
  it("lee filas y detecta el delimitador", () => {
    const result = parseCsv("a;b\n1;2\n");
    expect(result.ok && result.value.delimiter).toBe(";");
    expect(rowsOf("a;b\n1;2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("entiende comillas, comillas escapadas y saltos de línea dentro de un campo", () => {
    expect(rowsOf('a;b\n"x;y";"di ""hola"""\n"línea 1\nlínea 2";z')).toEqual([
      ["a", "b"],
      ["x;y", 'di "hola"'],
      ["línea 1\nlínea 2", "z"],
    ]);
  });

  it("acepta \\r\\n y \\r, ignora líneas vacías y una última línea sin salto", () => {
    expect(rowsOf("a;b\r\n1;2\r\n\r\n3;4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(rowsOf("a;b\r1;2\r")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("una comilla en mitad de un campo sin comillas es un carácter más", () => {
    expect(rowsOf('a;b\n5" pantalla;x')).toEqual([
      ["a", "b"],
      ['5" pantalla', "x"],
    ]);
  });

  it("conserva campos vacíos y filas de una sola columna con contenido", () => {
    expect(rowsOf("a;b;c\n;;\nsolo;;")).toEqual([
      ["a", "b", "c"],
      ["", "", ""],
      ["solo", "", ""],
    ]);
    expect(rowsOf("uno\ndos")).toEqual([["uno"], ["dos"]]);
  });

  it("permite forzar el delimitador", () => {
    expect(rowsOf("a;b,c\n1;2,3", ",")).toEqual([
      ["a;b", "c"],
      ["1;2", "3"],
    ]);
  });

  it("falla con códigos estables", () => {
    expect(parseCsv('a;b\n"sin cerrar;x')).toEqual({
      ok: false,
      error: { code: "csv.unterminated_quote" },
    });
    expect(parseCsv("")).toEqual({ ok: false, error: { code: "csv.empty" } });
    expect(parseCsv("\n\n  \n")).toEqual({ ok: false, error: { code: "csv.empty" } });
    expect(parseCsv("a\nb\nc", { maxRows: 2, maxCellLength: 10 })).toEqual({
      ok: false,
      error: { code: "csv.too_many_rows" },
    });
    expect(parseCsv("a;bbbbbbbbbbb", { maxRows: 5, maxCellLength: 10 })).toEqual({
      ok: false,
      error: { code: "csv.cell_too_long" },
    });
  });

  it("detecta los límites también al cerrar un campo o una fila", () => {
    const limits = { maxRows: 2, maxCellLength: 10 };
    expect(parseCsv("bbbbbbbbbbb;a", limits)).toEqual({
      ok: false,
      error: { code: "csv.cell_too_long" },
    });
    expect(parseCsv("bbbbbbbbbbb\na", limits)).toEqual({
      ok: false,
      error: { code: "csv.cell_too_long" },
    });
    expect(parseCsv("a\nb\nc\n", limits)).toEqual({
      ok: false,
      error: { code: "csv.too_many_rows" },
    });
  });

  it("acepta exactamente el máximo de filas", () => {
    expect(parseCsv("a\nb", { maxRows: 2, maxCellLength: 10 }).ok).toBe(true);
  });
});

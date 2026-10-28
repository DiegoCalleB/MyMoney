import { describe, expect, it } from "vitest";
import { cleanKey, parseComposition } from "@/lib/composition";

const rows = (...pairs: [string, string][]) => pairs.map(([key, percent]) => ({ key, percent }));

describe("cleanKey", () => {
  it("deja espacios simples y recorta a 80 caracteres", () => {
    expect(cleanKey("  Renta   variable  ")).toBe("Renta variable");
    expect(cleanKey("x".repeat(100))).toHaveLength(80);
  });
});

describe("parseComposition", () => {
  it("lee filas válidas e ignora las vacías", () => {
    expect(
      parseComposition(rows(["Renta variable", "75"], ["", ""], ["Renta fija", "25"])),
    ).toEqual({
      ok: true,
      entries: [
        { key: "Renta variable", weightBps: 7500 },
        { key: "Renta fija", weightBps: 2500 },
      ],
    });
  });

  it("admite una composición parcial y decimales con coma", () => {
    expect(parseComposition(rows(["EE. UU.", "60,5"]))).toEqual({
      ok: true,
      entries: [{ key: "EE. UU.", weightBps: 6050 }],
    });
  });

  it.each([
    [rows(["", ""]), "exposure.form.empty"],
    [rows(["A", "abc"]), "exposure.form.row_invalid"],
    [rows(["A", ""]), "exposure.form.row_invalid"],
    [rows(["", "50"]), "exposure.form.row_invalid"],
    [rows(["A", "0"]), "exposure.form.row_invalid"],
    [rows(["A", "101"]), "exposure.form.row_invalid"],
    [rows(["Europa", "30"], ["europa", "20"]), "exposure.form.duplicate"],
    [rows(["A", "60"], ["B", "50"]), "exposure.form.over_100"],
  ])("rechaza %j", (input, code) => {
    expect(parseComposition(input)).toEqual({ ok: false, code });
  });

  it("justo 100 % es válido", () => {
    expect(parseComposition(rows(["A", "60"], ["B", "40"])).ok).toBe(true);
  });
});

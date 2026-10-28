import { describe, expect, it } from "vitest";
import { XLSX_LIMITS, looksLikeXlsx, readXlsx, type XlsxLimits } from "../src";
import { xlsx, zip, type ZipOptions, type ZipSpec } from "./helpers/zip";

const rowsOf = (bytes: Uint8Array, sheet?: string, limits?: XlsxLimits) => {
  const r = readXlsx(bytes, sheet, limits);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const code = (bytes: Uint8Array, sheet?: string, limits?: XlsxLimits) => {
  const r = readXlsx(bytes, sheet, limits);
  return r.ok ? "ok" : r.error.code;
};
const sheet = (xml: string) => xlsx({ sheets: [{ name: "Hoja", xml }] });
const tight = (over: Partial<XlsxLimits>): XlsxLimits => ({ ...XLSX_LIMITS, ...over });

describe("looksLikeXlsx", () => {
  it("reconoce la firma ZIP", () => {
    expect(looksLikeXlsx(sheet(""))).toBe(true);
    expect(looksLikeXlsx(new TextEncoder().encode("a;b\n1;2"))).toBe(false);
    expect(looksLikeXlsx(Uint8Array.of(0x50, 0x4b))).toBe(false);
  });
});

describe("readXlsx: contenido", () => {
  const strings =
    '<sst><si><t>Fecha</t></si><si><r><t>Im</t></r><r><t xml:space="preserve">porte</t></r><rPh><t>fonética</t></rPh></si><si><t>a &amp; b &lt;c&gt; &#65;&#x42;</t></si><si/><si><t/></si></sst>';

  it("lee cadenas compartidas (también con formato), en línea, números y huecos", () => {
    const book = xlsx({
      sharedStrings: strings,
      sheets: [
        {
          name: "Actividad",
          xml:
            '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
            '<row r="2"><c r="A2" t="inlineStr"><is><t>texto</t></is></c><c r="B2"><v>12.5</v></c><c r="C2" t="s"><v>2</v></c></row>' +
            '<row r="3"><c r="A3" t="str"><v>fórmula</v></c><c r="B3" t="b"><v>1</v></c><c r="C3" t="b"><v>0</v></c><c r="D3" t="e"><v>#N/A</v></c></row>',
        },
      ],
    });
    const r = rowsOf(book);
    expect(r.sheet.name).toBe("Actividad");
    expect(r.sheet.rows).toEqual([
      ["Fecha", "", "Importe"],
      ["texto", "12.5", "a & b <c> AB"],
      ["fórmula", "1", "0", "#N/A"],
    ]);
  });

  it("una celda en línea sin texto da vacío", () => {
    expect(
      rowsOf(
        sheet(
          '<row r="1"><c r="A1" t="inlineStr"/><c r="B1" t="inlineStr"><v>x</v></c><c r="C1"><v>9</v></c></row>',
        ),
      ).sheet.rows,
    ).toEqual([["", "", "9"]]);
  });

  it("sin atributos de posición usa el orden; omite filas y celdas vacías", () => {
    const r = rowsOf(
      sheet(
        "<row><c><v>1</v></c><c><v>2</v></c></row><row/><row><c/></row><row><c t='inlineStr'><is><t> </t></is></c></row><row><c><v>3</v></c></row>".replaceAll(
          "'",
          '"',
        ),
      ),
    );
    expect(r.sheet.rows).toEqual([["1", "2"], ["3"]]);
  });

  it("las columnas de varias letras y los números en notación científica", () => {
    const r = rowsOf(
      sheet(
        '<row r="1"><c r="AA1"><v>1E-5</v></c><c r="AB1"><v>2.5E+3</v></c><c r="AC1"><v>1E</v></c></row>',
      ),
    );
    expect(r.sheet.rows[0]?.[26]).toBe("0.00001");
    expect(r.sheet.rows[0]?.[27]).toBe("2500");
    expect(r.sheet.rows[0]?.[28]).toBe("1E");
  });

  it("un índice de cadena inexistente da texto vacío y una entidad desconocida se deja tal cual", () => {
    const r = rowsOf(
      xlsx({
        sharedStrings: "<sst><si><t>&desconocida; &#0; &#xD800; &#99999999;</t></si></sst>",
        sheets: [
          {
            name: "H",
            xml: '<row r="1"><c r="A1" t="s"><v>9</v></c><c r="B1" t="s"><v>0</v></c></row>',
          },
        ],
      }),
    );
    expect(r.sheet.rows[0]).toEqual(["", "&desconocida; &#0; &#xD800; &#99999999;"]);
  });

  it("elige la hoja pedida sin distinguir mayúsculas, o la primera", () => {
    const book = xlsx({
      sheets: [
        { name: "Resumen", xml: '<row r="1"><c r="A1"><v>1</v></c></row>' },
        { name: "Account Activity", xml: '<row r="1"><c r="A1"><v>2</v></c></row>' },
      ],
    });
    expect(rowsOf(book).sheet.rows).toEqual([["1"]]);
    const second = rowsOf(book, "account activity");
    expect(second.sheet.rows).toEqual([["2"]]);
    expect(second.sheetNames).toEqual(["Resumen", "Account Activity"]);
    expect(code(book, "no existe")).toBe("xlsx.sheet_not_found");
  });

  it("admite rutas absolutas en las relaciones y nombres con entidades", () => {
    const book = xlsx({
      absoluteTargets: true,
      sheets: [{ name: "A &amp; B", xml: '<row r="1"><c r="A1"><v>7</v></c></row>' }],
    });
    const r = rowsOf(book);
    expect(r.sheet.name).toBe("A & B");
    expect(r.sheet.rows).toEqual([["7"]]);
  });

  it("una hoja sin datos da cero filas", () => {
    expect(rowsOf(sheet("")).sheet.rows).toEqual([]);
  });
});

describe("readXlsx: archivos no fiables", () => {
  const good = (extra: ZipSpec[] = []) =>
    xlsx({ sheets: [{ name: "H", xml: '<row r="1"><c r="A1"><v>1</v></c></row>' }], extra });
  const specs = (over: Partial<ZipSpec> = {}): ZipSpec[] => [
    { name: "a.txt", data: "hola", ...over },
  ];
  const withZip = (s: ZipSpec[], o: ZipOptions = {}) => zip(s, o);

  it("rechaza lo que no es un ZIP válido", () => {
    expect(code(new TextEncoder().encode("PK\x03\x04 pero no es un zip"))).toBe("xlsx.invalid_zip");
    expect(code(withZip(specs(), { noEocd: true }))).toBe("xlsx.invalid_zip");
    expect(code(withZip(specs(), { dirOffsetOverride: 99_999 }))).toBe("xlsx.invalid_zip");
    expect(code(withZip(specs(), { dirSizeOverride: 5, dirOffsetOverride: 10 }))).toBe(
      "xlsx.invalid_zip",
    );
  });

  it("rechaza varios discos, ZIP64 y demasiadas partes", () => {
    expect(code(withZip(specs(), { diskNumber: 1 }))).toBe("xlsx.unsupported_zip");
    expect(code(withZip(specs(), { entriesOverride: 0xffff }))).toBe("xlsx.unsupported_zip");
    expect(code(withZip(specs(), { dirSizeOverride: 0xffffffff }))).toBe("xlsx.unsupported_zip");
    expect(code(withZip(specs(), { dirOffsetOverride: 0xffffffff }))).toBe("xlsx.unsupported_zip");
    expect(code(withZip(specs({ zip64Sizes: true })))).toBe("xlsx.unsupported_zip");
    expect(code(withZip(specs({ localOffsetOverride: 0xffffffff })))).toBe("xlsx.unsupported_zip");
    expect(code(good(), undefined, tight({ maxEntries: 2 }))).toBe("xlsx.too_many_entries");
  });

  it("rechaza archivos cifrados", () => {
    expect(code(withZip(specs({ flags: 1 })))).toBe("xlsx.encrypted");
  });

  it("rechaza entradas del directorio mal formadas", () => {
    const bytes = withZip(specs());
    const broken = Uint8Array.from(bytes);
    // Estropea la firma de la primera entrada del directorio central.
    const dv = new DataView(broken.buffer);
    for (let i = broken.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        dv.setUint32(dv.getUint32(i + 16, true), 0, true);
        break;
      }
    }
    expect(code(broken)).toBe("xlsx.invalid_zip");
    // El nombre declarado se sale del archivo.
    expect(code(withZip(specs({ declaredNameLength: 60_000 })))).toBe("xlsx.invalid_zip");
  });

  it("rechaza una bomba de compresión aunque el tamaño declarado mienta", () => {
    const bomb = good([
      { name: "xl/sharedStrings.xml", data: "a".repeat(100_000), declaredSize: 10 },
    ]);
    expect(code(bomb)).toBe("xlsx.too_large");
  });

  it("rechaza partes demasiado grandes y se queda sin presupuesto", () => {
    expect(code(good(), undefined, tight({ maxEntryBytes: 50 }))).toBe("xlsx.too_large");
    expect(code(good(), undefined, tight({ maxTotalBytes: 400 }))).toBe("xlsx.too_large");
  });
});

describe("readXlsx: partes manipuladas", () => {
  const XML = '<?xml version="1.0"?>';
  const WORKBOOK = `${XML}<workbook xmlns:r="x"><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const RELS = `${XML}<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const SHEET = `${XML}<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>`;
  const parts = (over: Record<string, Partial<ZipSpec> | null> = {}, extra: ZipSpec[] = []) => {
    const base: Record<string, string> = {
      "xl/workbook.xml": WORKBOOK,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/sheet1.xml": SHEET,
    };
    return [
      ...Object.entries(base).flatMap(([name, data]) => {
        const tweak = over[name];
        return tweak === null ? [] : [{ name, data, ...tweak }];
      }),
      ...extra,
    ];
  };
  const book = (
    over: Record<string, Partial<ZipSpec> | null> = {},
    extra: ZipSpec[] = [],
    o: ZipOptions = {},
  ) => zip(parts(over, extra), o);

  it("el archivo de partida es válido", () => {
    expect(rowsOf(book()).sheet.rows).toEqual([["1"]]);
    expect(
      rowsOf(
        zip(parts({ "xl/workbook.xml": { method: 0 }, "xl/worksheets/sheet1.xml": { method: 0 } })),
      ).sheet.rows,
    ).toEqual([["1"]]);
  });

  it("comprueba el CRC, el tamaño y el método de cada parte", () => {
    expect(code(book({ "xl/workbook.xml": { declaredCrc: 1 } }))).toBe("xlsx.invalid_zip");
    expect(code(book({ "xl/workbook.xml": { method: 0, declaredSize: 5 } }))).toBe(
      "xlsx.invalid_zip",
    );
    expect(code(book({ "xl/workbook.xml": { method: 12 } }))).toBe("xlsx.unsupported_zip");
    expect(code(book({ "xl/worksheets/sheet1.xml": { declaredCrc: 1 } }))).toBe("xlsx.invalid_zip");
  });

  it("rechaza cabeceras locales y desplazamientos que no cuadran", () => {
    expect(code(book({}, [], { badLocalSignature: true }))).toBe("xlsx.invalid_zip");
    expect(code(book({ "xl/workbook.xml": { localOffsetOverride: 9_999_999 } }))).toBe(
      "xlsx.invalid_zip",
    );
    expect(code(book({ "xl/workbook.xml": { declaredCompressed: 50_000_000 } }))).toBe(
      "xlsx.invalid_zip",
    );
  });

  it("exige las partes básicas", () => {
    expect(code(book({ "xl/workbook.xml": null }))).toBe("xlsx.missing_part");
    expect(code(book({ "xl/_rels/workbook.xml.rels": null }))).toBe("xlsx.missing_part");
    expect(code(book({ "xl/worksheets/sheet1.xml": null }))).toBe("xlsx.missing_part");
  });

  it("rechaza XML con DOCTYPE o ENTITY en cualquier parte", () => {
    const dtd = '<!DOCTYPE x [<!ENTITY a "b">]>';
    expect(code(book({ "xl/workbook.xml": { data: dtd + WORKBOOK } }))).toBe("xlsx.forbidden_xml");
    expect(code(book({ "xl/_rels/workbook.xml.rels": { data: dtd + RELS } }))).toBe(
      "xlsx.forbidden_xml",
    );
    expect(code(book({ "xl/worksheets/sheet1.xml": { data: dtd + SHEET } }))).toBe(
      "xlsx.forbidden_xml",
    );
    expect(code(book({}, [{ name: "xl/sharedStrings.xml", data: `${dtd}<sst/>` }]))).toBe(
      "xlsx.forbidden_xml",
    );
  });

  it("sin hojas utilizables no hay nada que leer", () => {
    expect(
      code(book({ "xl/workbook.xml": { data: `${XML}<workbook><sheets/></workbook>` } })),
    ).toBe("xlsx.no_sheets");
    expect(
      code(
        book({
          "xl/_rels/workbook.xml.rels": {
            data: `${XML}<Relationships><Relationship Id="x"/></Relationships>`,
          },
        }),
      ),
    ).toBe("xlsx.no_sheets");
    expect(
      code(
        book({
          "xl/workbook.xml": {
            data: `${XML}<workbook xmlns:r="x"><sheets><sheet sheetId="1" r:id="rId1"/><sheet name="X" sheetId="2"/></sheets></workbook>`,
          },
        }),
      ),
    ).toBe("xlsx.no_sheets");
  });

  it("aplica los límites de cadenas compartidas, filas, columnas y celdas", () => {
    const shared = (n: number) => ({
      name: "xl/sharedStrings.xml",
      data: `<sst>${"<si><t>a</t></si>".repeat(n)}</sst>`,
    });
    expect(code(book({}, [shared(3)]), undefined, tight({ maxSharedStrings: 2 }))).toBe(
      "xlsx.too_large",
    );
    expect(code(book({}, [{ ...shared(1), declaredCrc: 1 }]))).toBe("xlsx.invalid_zip");
    const sheetWith = (rows: string) =>
      book({
        "xl/worksheets/sheet1.xml": {
          data: `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
        },
      });
    expect(
      code(
        sheetWith('<row r="1"><c r="A1"><v>1</v></c></row><row r="3"><c r="A3"><v>1</v></c></row>'),
        undefined,
        tight({ maxRows: 2 }),
      ),
    ).toBe("xlsx.too_many_rows");
    expect(
      code(
        sheetWith('<row r="1"><c r="C1"><v>1</v></c></row>'),
        undefined,
        tight({ maxColumns: 2 }),
      ),
    ).toBe("xlsx.too_many_columns");
    expect(
      code(
        sheetWith('<row r="1"><c r="A1" t="str"><v>abcdef</v></c></row>'),
        undefined,
        tight({ maxCellLength: 3 }),
      ),
    ).toBe("xlsx.cell_too_long");
  });

  it("las partes que se leen comparten un presupuesto total", () => {
    const filler = (n: number) => ({
      name: "xl/sharedStrings.xml",
      data: `<sst><!--${"x".repeat(n)}--></sst>`,
    });
    expect(code(book({}, [filler(2_000)]), undefined, tight({ maxTotalBytes: 2_000 }))).toBe(
      "xlsx.too_large",
    );
    expect(code(book({}, [filler(2_000)]), undefined, tight({ maxTotalBytes: 10_000 }))).toBe("ok");
  });
});

import { describe, expect, it } from "vitest";
import { analyzeIngPaste, parseIngPaste } from "../src";

const link = (inner: string) => `[${inner}](https://ing.example/pfm/#)`;
const ACCOUNT = "00000000-0000-4000-8000-000000000001";

// Datos inventados con el mismo formato que la web de ING.
const SAMPLE = [
  "Retenidos (1)",
  link("28 de octubre de 2026, TIENDA RETENIDA SA , Importe: -11.6 €"),
  "TIENDA RETENIDA SA",
  "−11,60 €",
  "* Hoy",
  link(
    "28 de octubre de 2026, Pago en SUPER UNO MADRID ES, Supermercados y alimentación, Importe: -5.09 €, Balance tras este movimiento: 186.8 €",
  ),
  "Pago en SUPER UNO MADRID ES",
  link(
    "28 de octubre de 2026, Recibo LUZ SA, S.A., Luz y gas, Importe: -46.83 €, Balance tras este movimiento: 209.06 €",
  ),
  link("27 de octubre de 2026, Pago en ") +
    link("WWW.TIENDA*AB12") +
    link(
      " LUXEMBOURG LU, Compras (otros), Importe: -28.89 €, Balance tras este movimiento: 255.89 €",
    ),
  link(
    "26 de octubre de 2026, Bizum enviado a PERSONA UNO, Gasto Bizum, Pizza del viernes, Importe: -50 €, Balance tras este movimiento: 426.09 €",
  ),
  link(
    "25 de octubre de 2026, Transferencia emitida a Ana Ejemplo Prueba, Transferencias, Importe: -1900 €, Balance tras este movimiento: 847.45 €",
  ),
  link(
    "24 de octubre de 2026, Traspaso emitido a Ana Ejemplo Prueba, Redondeo, Importe: -2.1 €, Balance tras este movimiento: 843.56 €",
  ),
  link(
    "23 de octubre de 2026, Traspaso interno recibido, Traspaso entre cuentas, Importe: 800 €, Balance tras este movimiento: 1604.03 €",
  ),
  link(
    "22 de octubre de 2026, Nomina recibida EMPRESA SL, Nómina o Pensión, Importe: 2173.29 €, Balance tras este movimiento: 2772.27 €",
  ),
  link(
    "21 de octubre de 2026, Devolución Tarjeta TIENDA DOS, Ropa y complementos, Importe: 8 €, Balance tras este movimiento: 658.73 €",
  ),
  link("20 de octubre de 2026, esto no se entiende"),
].join("\n");

describe("parseIngPaste", () => {
  it("lee los movimientos, cuenta los retenidos y los ilegibles", () => {
    const r = parseIngPaste(SAMPLE, { ownNames: ["Ana Ejemplo Prueba"] });
    expect(r.pending).toBe(1);
    expect(r.unreadable).toBe(1);
    expect(r.entries.map((e) => [e.date, e.amount.minor, e.description, e.category])).toEqual([
      ["2026-10-28", -509n, "SUPER UNO MADRID ES", "Supermercados y alimentación"],
      ["2026-10-28", -4683n, "Recibo LUZ SA, S.A.", "Luz y gas"],
      ["2026-10-27", -2889n, "WWW.TIENDA*AB12 LUXEMBOURG LU", "Compras (otros)"],
      ["2026-10-26", -5000n, "Bizum enviado", "Gasto Bizum"],
      ["2026-10-25", -190000n, "Transferencia emitida", "Transferencias"],
      ["2026-10-24", -210n, "Traspaso emitido", "Redondeo"],
      ["2026-10-23", 80000n, "Traspaso recibido", "Traspaso entre cuentas"],
      ["2026-10-22", 217329n, "Nómina", "Nómina o Pensión"],
      ["2026-10-21", 800n, "Devolución Tarjeta TIENDA DOS", "Ropa y complementos"],
    ]);
    expect(r.entries[0]?.balanceAfter?.minor).toBe(18680n);
    expect(r.entries.map((e) => e.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("reconoce los traspasos propios por categoría y por el nombre de la persona", () => {
    const internal = (own?: string[]) =>
      parseIngPaste(SAMPLE, own ? { ownNames: own } : {}).entries.map((e) => e.internal);
    // Sin nombre: solo el redondeo y el traspaso entre cuentas.
    expect(internal()).toEqual([false, false, false, false, false, true, true, false, false]);
    // Con nombre (con o sin tildes y mayúsculas): también la transferencia a sí misma.
    expect(internal(["ana EJEMPLO prueba"])).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("no guarda nombres de terceros en el concepto", () => {
    const text = parseIngPaste(SAMPLE, { ownNames: ["Ana Ejemplo Prueba"] })
      .entries.map((e) => e.description)
      .join("|");
    expect(text).not.toMatch(/PERSONA UNO|Ana Ejemplo|Pizza/i);
  });

  it("sin categoría conocida deja todo como concepto", () => {
    const r = parseIngPaste(
      link(
        "5 de enero de 2026, Pago en OTRO SITIO, Categoría nueva, Importe: -3 €, Balance tras este movimiento: 10 €",
      ),
    );
    expect(r.entries[0]).toMatchObject({
      description: "OTRO SITIO, Categoría nueva",
      category: null,
    });
  });

  it("rechaza fechas, meses e importes imposibles", () => {
    const bad = [
      link("31 de febrero de 2026, X, Importe: -3 €, Balance tras este movimiento: 10 €"),
      link("3 de mes raro de 2026, X, Importe: -3 €, Balance tras este movimiento: 10 €"),
      link("3 de enero de 2026, X, Importe: 0 €, Balance tras este movimiento: 10 €"),
      link("3 de enero de 2026, X, Importe: -3.123 €, Balance tras este movimiento: 10 €"),
    ].join("\n");
    const r = parseIngPaste(bad);
    expect(r.entries).toEqual([]);
    expect(r.unreadable).toBe(4);
  });

  it("un saldo ilegible invalida solo ese movimiento", () => {
    const r = parseIngPaste(
      link("3 de enero de 2026, X, Importe: -3 €, Balance tras este movimiento: 10.123 €"),
    );
    expect(r.unreadable).toBe(1);
  });
});

describe("analyzeIngPaste", () => {
  const options = { ownNames: ["Ana Ejemplo Prueba"] };

  it("deja fuera lo interno y lo retenido y numera lo que se importa", () => {
    const r = analyzeIngPaste(SAMPLE, ACCOUNT, options);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.rows.map((x) => x.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.value.internal).toBe(3);
    expect(r.value.pending).toBe(1);
    expect(r.value.unreadable).toBe(1);
    expect(r.value.fingerprints).toHaveLength(6);
    expect(new Set(r.value.fingerprints).size).toBe(6);
  });

  it("el mismo texto en otro orden da el mismo conjunto de huellas", () => {
    const lines = SAMPLE.split("\n");
    const a = analyzeIngPaste(SAMPLE, ACCOUNT, options);
    const b = analyzeIngPaste([...lines].reverse().join("\n"), ACCOUNT, options);
    if (!a.ok || !b.ok) throw new Error("se esperaba resultado");
    expect(b.value.fileSha256).toBe(a.value.fileSha256);
    expect([...b.value.fingerprints].sort()).toEqual([...a.value.fingerprints].sort());
  });

  it("dos movimientos idénticos el mismo día no se confunden", () => {
    const one = link(
      "3 de enero de 2026, Pago en CAFE, Cafeterías y restaurantes, Importe: -2 €, Balance tras este movimiento: 10 €",
    );
    const r = analyzeIngPaste(`${one}\n${one}`, ACCOUNT);
    if (!r.ok) throw new Error(r.error.code);
    expect(new Set(r.value.fingerprints).size).toBe(2);
  });

  it("falla con código estable si no hay datos, hay demasiado texto o demasiadas filas", () => {
    expect(analyzeIngPaste("nada", ACCOUNT)).toEqual({
      ok: false,
      error: { code: "import.no_data" },
    });
    // Todo interno: tampoco hay nada que importar.
    expect(
      analyzeIngPaste(
        link(
          "3 de enero de 2026, Traspaso emitido, Redondeo, Importe: -1 €, Balance tras este movimiento: 10 €",
        ),
        ACCOUNT,
      ),
    ).toEqual({ ok: false, error: { code: "import.no_data" } });
    expect(analyzeIngPaste("x".repeat(2 * 1024 * 1024 + 1), ACCOUNT)).toEqual({
      ok: false,
      error: { code: "import.file_too_large" },
    });
    const many = Array.from({ length: 5001 }, (_, i) =>
      link(
        `3 de enero de 2026, Pago en C${String(i)}, Compras (otros), Importe: -1 €, Balance tras este movimiento: ${String(i + 1)} €`,
      ),
    ).join("\n");
    expect(analyzeIngPaste(many, ACCOUNT)).toEqual({
      ok: false,
      error: { code: "import.too_many_rows" },
    });
  });
});

describe("conceptos", () => {
  const one = (middle: string) =>
    parseIngPaste(
      link(`3 de enero de 2026, ${middle}, Importe: -3 €, Balance tras este movimiento: 10 €`),
    ).entries[0];

  it("quita el nombre de quien envía o recibe, también en lo recibido", () => {
    expect(one("Bizum recibido de PERSONA DOS, Ingreso Bizum, gracias")?.description).toBe(
      "Bizum recibido",
    );
    expect(
      one("Transferencia recibida PERSONA TRES, Ingresos de otras entidades")?.description,
    ).toBe("Transferencia recibida");
  });

  it("solo toma como categoría un tramo completo, el primero que aparece", () => {
    // «Agua» seguido de más letras no es la categoría; con dos reales gana la primera.
    expect(one("Pago en Aguas Norte, Agua")).toMatchObject({
      description: "Aguas Norte",
      category: "Agua",
    });
    expect(one("Pago en SITIO, Compras (otros), Luz y gas")).toMatchObject({
      description: "SITIO",
      category: "Compras (otros)",
    });
    expect(one("Pago en SITIO, Aguardiente, Luz y gas")).toMatchObject({
      description: "SITIO, Aguardiente",
      category: "Luz y gas",
    });
  });
});

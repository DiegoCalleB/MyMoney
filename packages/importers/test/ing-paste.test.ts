import { describe, expect, it } from "vitest";
import {
  analyzeIngPaste,
  categoryKey,
  ingCategory,
  ingImportTransactions,
  ingKind,
  parseIngPaste,
  type IngEntry,
} from "../src";

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

describe("ingImportTransactions", () => {
  it("convierte cada fila en ingreso o gasto con patas que cuadran, y filtra por fila", () => {
    const r = analyzeIngPaste(SAMPLE, ACCOUNT, { ownNames: ["Ana Ejemplo Prueba"] });
    if (!r.ok) throw new Error(r.error.code);
    const all = ingImportTransactions(r.value.rows, ACCOUNT);
    expect(all).toHaveLength(6);
    expect(all[0]).toMatchObject({ row_index: 1, kind: "expense", occurred_on: "2026-10-28" });
    expect(all[0]?.legs.map((l) => l.amount_minor)).toEqual(["-509", "509"]);
    expect(all.find((t) => t.kind === "income")?.legs[0]?.amount_minor).toBe("217329");
    // El reembolso (importe positivo con categoría de gasto) es un gasto, no un ingreso.
    expect(all.find((t) => t.row_index === 6)?.kind).toBe("expense");
    const some = ingImportTransactions(r.value.rows, ACCOUNT, new Set([2, 4]));
    expect(some.map((t) => t.row_index)).toEqual([2, 4]);
  });
});

describe("tipo y categoría", () => {
  const entry = (category: string | null, minor: bigint) =>
    parseIngPaste(
      link(
        `3 de enero de 2026, Pago en X${category ? `, ${category}` : ""}, Importe: ${(Number(minor) / 100).toString()} €, Balance tras este movimiento: 10 €`,
      ),
    ).entries[0] as IngEntry;

  it("distingue ingresos, gastos y reembolsos", () => {
    expect(ingKind(entry("Nómina o Pensión", 100000n))).toBe("income");
    expect(ingKind(entry(null, 500n))).toBe("income");
    expect(ingKind(entry(null, -500n))).toBe("expense");
    expect(ingKind(entry("Supermercados y alimentación", 399n))).toBe("expense");
    // Un ingreso con importe negativo se trata como gasto: la base de datos no admite lo contrario.
    expect(ingKind(entry("Ingreso Bizum", -300n))).toBe("expense");
  });

  it("traduce las categorías de ING a las de MyMoney", () => {
    expect(ingCategory(entry("Supermercados y alimentación", -500n))).toEqual({
      name: "Alimentación",
      kind: "expense",
      essential: true,
    });
    expect(ingCategory(entry("Farmacia, herbolario y nutrición", -500n)).name).toBe("Salud");
    expect(ingCategory(entry("Nómina o Pensión", 500n))).toMatchObject({
      name: "Nómina",
      kind: "income",
    });
    expect(ingCategory(entry("Ingreso Bizum", 500n)).name).toBe("Otros ingresos");
    expect(ingCategory(entry("Transferencias", -500n)).name).toBe("Otros gastos");
  });

  it("sin categoría o con una no reconocida va a «Otros»", () => {
    expect(ingCategory(entry(null, -500n))).toMatchObject({
      name: "Otros gastos",
      kind: "expense",
    });
    expect(ingCategory(entry(null, 500n))).toMatchObject({
      name: "Otros ingresos",
      kind: "income",
    });
    // Categoría de ingresos con importe negativo: como gasto, y sin categoría de gasto asociada.
    expect(ingCategory(entry("Ingreso Bizum", -300n))).toMatchObject({
      name: "Otros gastos",
      kind: "expense",
    });
    // Una categoría de ING sin correspondencia (p. ej. «Traspaso entre cuentas») cae en «Otros».
    expect(ingCategory(entry("Redondeo", -300n)).name).toBe("Otros gastos");
  });

  it("pone la categoría en la pata externa solo si se conoce su id", () => {
    const row = entry("Supermercados y alimentación", -500n);
    const key = categoryKey(ingCategory(row));
    expect(key).toBe("expense|Alimentación");
    const withIds = ingImportTransactions([row], ACCOUNT, undefined, new Map([[key, "cat-1"]]));
    expect(withIds[0]?.legs[1]).toMatchObject({ role: "external", category_id: "cat-1" });
    expect(withIds[0]?.legs[0]).not.toHaveProperty("category_id");
    expect(
      ingImportTransactions([row], ACCOUNT, undefined, new Map())[0]?.legs[1],
    ).not.toHaveProperty("category_id");
  });
});

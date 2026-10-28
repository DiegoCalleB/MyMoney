import { money } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import {
  MAX_FILE_BYTES,
  analyzeCsv,
  toHex,
  toTransactionPayload,
  type ColumnMapping,
} from "../src";

// Extracto inventado con la forma habitual de un banco español.
const FILE = [
  "Fecha operación;Fecha valor;Concepto;Importe;Saldo",
  "27/10/2026;27/10/2026;Supermercado Ejemplo;-45,30;1.204,70",
  "26/10/2026;26/10/2026;Nómina empresa ficticia;1.500,00;1.250,00",
  "26/10/2026;26/10/2026;Café;-3,00;-250,00",
  "26/10/2026;26/10/2026;Café;-3,00;-247,00",
  "25/10/2026;25/10/2026;Fecha mala 31/02;abc;0,00",
].join("\n");
const bytes = (text: string) => new TextEncoder().encode(text);
const analyze = (text: string, mapping?: ColumnMapping) =>
  analyzeCsv({
    bytes: bytes(text),
    accountId: "acc-1",
    currency: "EUR",
    ...(mapping ? { mapping } : {}),
  });

describe("analyzeCsv", () => {
  it("analiza un extracto: mapeo, filas válidas, errores y resumen", () => {
    const result = analyze(FILE);
    if (!result.ok) throw new Error(result.error.code);
    const a = result.value;
    expect(a.delimiter).toBe(";");
    expect(a.mapping).toMatchObject({ dateColumn: 0, descriptionColumn: 2, balanceColumn: 4 });
    expect(a.rows).toHaveLength(4);
    expect(a.errors).toEqual([{ index: 5, code: "row.amount_invalid" }]);
    expect(a.summary).toEqual({
      dataRows: 5,
      validRows: 4,
      from: "2026-10-26",
      to: "2026-10-27",
      hasBalance: true,
    });
    expect(toHex(a.fileSha256)).toHaveLength(64);
    expect(new Set(a.rows.map((r) => toHex(r.fingerprint))).size).toBe(4);
  });

  it("si ninguna fila es válida, el resumen no tiene fechas", () => {
    const result = analyze("Fecha;Importe\n31/02/2026;1,00");
    expect(result.ok && result.value.summary).toEqual({
      dataRows: 1,
      validRows: 0,
      from: null,
      to: null,
      hasBalance: false,
    });
  });

  it("el mismo archivo da el mismo hash y las mismas huellas", () => {
    const a = analyze(FILE);
    const b = analyze(FILE);
    if (!a.ok || !b.ok) throw new Error("debía analizar");
    expect(toHex(a.value.fileSha256)).toBe(toHex(b.value.fileSha256));
    expect(a.value.rows.map((r) => toHex(r.fingerprint))).toEqual(
      b.value.rows.map((r) => toHex(r.fingerprint)),
    );
  });

  it("un archivo posterior que se solapa comparte las huellas de lo ya importado", () => {
    const later = [
      "Fecha operación;Fecha valor;Concepto;Importe;Saldo",
      "28/10/2026;28/10/2026;Bizum recibido;20,00;1.224,70",
      "27/10/2026;27/10/2026;Supermercado Ejemplo;-45,30;1.204,70",
      "26/10/2026;26/10/2026;Nómina empresa ficticia;1.500,00;1.250,00",
    ].join("\n");
    const a = analyze(FILE);
    const b = analyze(later);
    if (!a.ok || !b.ok) throw new Error("debía analizar");
    const fingerprintsA = new Set(a.value.rows.map((r) => toHex(r.fingerprint)));
    const shared = b.value.rows.filter((r) => fingerprintsA.has(toHex(r.fingerprint)));
    expect(shared.map((r) => r.description)).toEqual([
      "Supermercado Ejemplo",
      "Nómina empresa ficticia",
    ]);
  });

  it("lee un archivo en Windows-1252 y con comas de millar en inglés", () => {
    const latin1 = Uint8Array.from([
      ...bytes("Fecha;Concepto;Importe\n27/10/2026;N"),
      0xf3,
      ...bytes("mina;1.500,00"),
    ]);
    const result = analyzeCsv({ bytes: latin1, accountId: "a", currency: "EUR" });
    expect(result.ok && result.value.rows[0]?.description).toBe("Nómina");

    const english = analyze(
      'Date,Description,Amount\n2026-10-27,Salary,"1,500.00"\n2026-10-28,Coffee,-3.50',
    );
    expect(english.ok && english.value.rows.map((r) => r.amount.minor)).toEqual([150000n, -350n]);
  });

  it("usa el mapeo que se le dé en lugar del detectado", () => {
    const custom: ColumnMapping = {
      dateColumn: 1,
      dateFormat: "dmy",
      descriptionColumn: 2,
      amount: { kind: "single", column: 3 },
      balanceColumn: null,
      numberFormat: "es",
    };
    const result = analyze(FILE, custom);
    expect(result.ok && result.value.summary.hasBalance).toBe(false);
  });

  it("falla con códigos estables", () => {
    expect(
      analyzeCsv({ bytes: new Uint8Array(MAX_FILE_BYTES + 1), accountId: "a", currency: "EUR" }),
    ).toEqual({
      ok: false,
      error: { code: "import.file_too_large" },
    });
    expect(analyze("")).toEqual({ ok: false, error: { code: "csv.empty" } });
    expect(analyze("Fecha;Importe")).toEqual({ ok: false, error: { code: "import.no_data" } });
    expect(analyze("Concepto;Cosa\nx;y")).toEqual({
      ok: false,
      error: { code: "import.mapping_not_detected" },
    });
    expect(
      analyze(FILE, {
        dateColumn: 0,
        dateFormat: "dmy",
        descriptionColumn: null,
        amount: { kind: "single", column: 99 },
        balanceColumn: null,
        numberFormat: "es",
      }),
    ).toEqual({ ok: false, error: { code: "import.mapping_not_detected" } });
  });
});

describe("toTransactionPayload", () => {
  const base = {
    index: 1,
    date: "2026-10-27" as never,
    description: "Supermercado",
    balanceAfter: null,
  };
  it("un gasto lleva la pata de efectivo negativa y la externa positiva, y cuadra", () => {
    const payload = toTransactionPayload({ ...base, amount: money(-4530n, "EUR") }, "acc-1");
    expect(payload.kind).toBe("expense");
    expect(payload.legs).toEqual([
      { role: "cash", account_id: "acc-1", amount_minor: "-4530", currency: "EUR" },
      { role: "external", account_id: null, amount_minor: "4530", currency: "EUR" },
    ]);
    expect(payload.legs.reduce((s, l) => s + BigInt(l.amount_minor), 0n)).toBe(0n);
  });
  it("un ingreso lleva la pata de efectivo positiva; sin concepto, descripción nula", () => {
    const payload = toTransactionPayload(
      { ...base, description: "", amount: money(150000n, "EUR") },
      "acc-1",
    );
    expect(payload.kind).toBe("income");
    expect(payload.description).toBeNull();
    expect(payload.legs[0].amount_minor).toBe("150000");
    expect(payload.legs[1].amount_minor).toBe("-150000");
  });
});

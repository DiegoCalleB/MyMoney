import { describe, expect, it } from "vitest";
import { analyzeCsv, commitPayload, previewPayload } from "../src";

const FILE = [
  "Fecha;Concepto;Importe",
  "27/10/2026;Supermercado Ejemplo;-45,30",
  "26/10/2026;Nómina ficticia;1.500,00",
  "25/10/2026;Fecha mala;abc",
].join("\n");
const analysis = (() => {
  const result = analyzeCsv({
    bytes: new TextEncoder().encode(FILE),
    accountId: "acc-1",
    currency: "EUR",
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
})();

describe("previewPayload", () => {
  it("incluye filas válidas y erróneas, ordenadas, con huella de 64 caracteres", () => {
    const rows = previewPayload(analysis, "acc-1");
    expect(rows.map((r) => r.row_index)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.error_code)).toEqual([null, null, "row.amount_invalid"]);
    for (const r of rows) expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la huella de una fila errónea depende de la cuenta y de su posición", () => {
    const a = previewPayload(analysis, "acc-1")[2]?.fingerprint;
    const b = previewPayload(analysis, "acc-2")[2]?.fingerprint;
    expect(a).not.toBe(b);
  });
});

describe("commitPayload", () => {
  it("solo envía las filas pendientes, con sus patas", () => {
    const txs = commitPayload(analysis, "acc-1", new Set([1]), true);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      row_index: 1,
      kind: "expense",
      occurred_on: "2026-10-27",
      description: "Supermercado Ejemplo",
    });
    expect(txs[0]?.legs.map((l) => l.amount_minor)).toEqual(["-4530", "4530"]);
  });

  it("no guarda el concepto si no se pide", () => {
    const txs = commitPayload(analysis, "acc-1", new Set([1, 2]), false);
    expect(txs.map((t) => t.description)).toEqual([null, null]);
  });

  it("una fila duplicada (no pendiente) no se envía", () => {
    expect(commitPayload(analysis, "acc-1", new Set(), true)).toEqual([]);
  });
});

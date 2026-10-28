import { createHash } from "node:crypto";
import type { NormalizedRow } from "./rows";
import { descriptionKey } from "./rows";

function sha256(text: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(text, "utf8").digest());
}

function tupleKey(row: NormalizedRow): string {
  return [
    row.date,
    row.amount.minor.toString(),
    row.amount.currency,
    descriptionKey(row.description),
    row.balanceAfter ? row.balanceAfter.minor.toString() : "",
  ].join("|");
}

/**
 * Huella de cada fila (ADR-0008): SHA-256 de la cuenta, la fecha, el importe en unidades mínimas,
 * la moneda, el concepto normalizado, el saldo posterior y el ordinal de esa misma combinación
 * dentro del archivo. El ordinal se asigna en orden canónico, no en el orden del archivo, de
 * modo que dos extractos que se solapan dan la misma huella a los apuntes que comparten aunque
 * vengan ordenados de otra forma. Devuelve las huellas en el orden de entrada.
 */
export function fingerprintRows(accountId: string, rows: readonly NormalizedRow[]): Uint8Array[] {
  const keys = rows.map(tupleKey);
  const canonical = keys.map((key, position) => ({ key, position }));
  canonical.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.position - b.position));

  const seen = new Map<string, number>();
  const result = new Array<Uint8Array>(rows.length);
  for (const { key, position } of canonical) {
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);
    result[position] = sha256(`${accountId}|${key}|${String(ordinal)}`);
  }
  return result;
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function fileSha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

import { createHash } from "node:crypto";
import type { Analysis } from "./analyze";
import { toHex } from "./fingerprint";
import { toTransactionPayload, type TransactionPayload } from "./legs";

/** Fila tal como la espera `import_preview` (`jsonb_to_recordset`). */
export interface PreviewRowPayload {
  readonly row_index: number;
  /** SHA-256 en hexadecimal (64 caracteres). */
  readonly fingerprint: string;
  readonly error_code: string | null;
}

/** Movimiento tal como lo espera `import_commit`. */
export interface CommitTransactionPayload {
  readonly row_index: number;
  readonly kind: TransactionPayload["kind"];
  readonly occurred_on: string;
  readonly description: string | null;
  readonly legs: TransactionPayload["legs"];
}

/**
 * Filas para la vista previa: las válidas con su huella (ADR-0008) y las erróneas con su código.
 * Una fila errónea no tiene importe que huellar, así que lleva una huella propia derivada del
 * archivo y de su posición: nunca choca con otra y no se puede importar.
 */
export function previewPayload(analysis: Analysis, accountId: string): PreviewRowPayload[] {
  const valid = analysis.rows.map((row) => ({
    row_index: row.index,
    fingerprint: toHex(row.fingerprint),
    error_code: null,
  }));
  const failed = analysis.errors.map((error) => ({
    row_index: error.index,
    fingerprint: createHash("sha256")
      .update(`error|${accountId}|${toHex(analysis.fileSha256)}|${String(error.index)}`)
      .digest("hex"),
    error_code: error.code,
  }));
  return [...valid, ...failed].sort((a, b) => a.row_index - b.row_index);
}

/**
 * Movimientos para confirmar: solo las filas que la base de datos marcó como nuevas (`pending`),
 * de modo que una duplicada nunca se reenvía. Con `keepDescriptions: false` no se guarda el concepto
 * del extracto (minimización, ADR-0012).
 */
export function commitPayload(
  analysis: Analysis,
  accountId: string,
  pending: ReadonlySet<number>,
  keepDescriptions: boolean,
): CommitTransactionPayload[] {
  return analysis.rows
    .filter((row) => pending.has(row.index))
    .map((row) => {
      const tx = toTransactionPayload(row, accountId);
      return {
        row_index: row.index,
        kind: tx.kind,
        occurred_on: tx.occurredOn,
        description: keepDescriptions ? tx.description : null,
        legs: tx.legs,
      };
    });
}

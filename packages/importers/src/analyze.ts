import {
  err,
  ok,
  type CalendarDate,
  type CurrencyCode,
  type DomainError,
  type Result,
} from "@mymoney/finance-core";
import { detectMapping, isValidMapping, type ColumnMapping } from "./columns";
import { decodeText, parseCsv, type Delimiter } from "./csv";
import { fileSha256, fingerprintRows } from "./fingerprint";
import { normalizeRows, type NormalizedRow, type RowError } from "./rows";

/** Límite de tamaño del archivo (el del bucket `imports`). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface AnalyzeInput {
  readonly bytes: Uint8Array;
  readonly accountId: string;
  readonly currency: CurrencyCode;
  /** Mapeo elegido a mano; si falta se detecta a partir de la cabecera. */
  readonly mapping?: ColumnMapping;
}

export interface AnalyzedRow extends NormalizedRow {
  readonly fingerprint: Uint8Array;
}

export interface Analysis {
  readonly fileSha256: Uint8Array;
  /** Separador del CSV; `null` si el archivo es una hoja de cálculo. */
  readonly delimiter: Delimiter | null;
  readonly header: readonly string[];
  readonly mapping: ColumnMapping;
  readonly rows: readonly AnalyzedRow[];
  readonly errors: readonly RowError[];
  /** Filas que la plantilla de la entidad deja fuera a propósito (compras, otras monedas…). */
  readonly skipped: number;
  /** Plantilla de entidad aplicada, si se reconoció la cabecera. */
  readonly template: {
    readonly id: string;
    readonly label: string;
    readonly verified: boolean;
  } | null;
  readonly summary: {
    readonly dataRows: number;
    readonly validRows: number;
    readonly from: CalendarDate | null;
    readonly to: CalendarDate | null;
    readonly hasBalance: boolean;
  };
}

/**
 * Analiza las filas de un extracto (de un CSV o de una hoja de cálculo) sin tocar la base de
 * datos: detecta (o aplica) el mapeo de columnas, normaliza las filas y calcula sus huellas.
 * Falla con un código estable si está vacío o no se reconocen las columnas.
 */
export function analyzeRows(
  rows: readonly (readonly string[])[],
  delimiter: Delimiter | null,
  input: AnalyzeInput,
): Result<Analysis, DomainError> {
  const [header, ...data] = rows;
  if (!header || data.length === 0) return err({ code: "import.no_data" });

  const mapping = input.mapping ?? detectMapping(rows);
  if (!mapping || !isValidMapping(mapping, header.length)) {
    return err({ code: "import.mapping_not_detected" });
  }

  const normalized = normalizeRows(data, mapping, input.currency);
  const fingerprints = fingerprintRows(input.accountId, normalized.rows);
  const analyzed = normalized.rows.map((row, i) => ({
    ...row,
    fingerprint: fingerprints[i] as Uint8Array,
  }));
  const dates = normalized.rows.map((r) => r.date).sort();

  return ok({
    fileSha256: fileSha256(input.bytes),
    delimiter,
    header,
    mapping,
    rows: analyzed,
    errors: normalized.errors,
    skipped: 0,
    template: null,
    summary: {
      dataRows: data.length,
      validRows: normalized.rows.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      hasBalance: mapping.balanceColumn !== null,
    },
  });
}

/**
 * Analiza un CSV de movimientos de una cuenta: lo lee con los límites de tamaño y de forma y
 * delega en `analyzeRows`.
 */
export function analyzeCsv(input: AnalyzeInput): Result<Analysis, DomainError> {
  if (input.bytes.length > MAX_FILE_BYTES) return err({ code: "import.file_too_large" });
  const table = parseCsv(decodeText(input.bytes));
  if (!table.ok) return table;
  return analyzeRows(table.value.rows, table.value.delimiter, input);
}

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
  readonly delimiter: Delimiter;
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
 * Analiza un CSV de movimientos de una cuenta sin tocar la base de datos: lo lee, detecta (o
 * aplica) el mapeo de columnas, normaliza las filas y calcula sus huellas. Falla con un código
 * estable si el archivo es demasiado grande, está vacío o no se reconocen las columnas.
 */
export function analyzeCsv(input: AnalyzeInput): Result<Analysis, DomainError> {
  if (input.bytes.length > MAX_FILE_BYTES) return err({ code: "import.file_too_large" });
  const table = parseCsv(decodeText(input.bytes));
  if (!table.ok) return table;

  const [header, ...data] = table.value.rows;
  if (!header || data.length === 0) return err({ code: "import.no_data" });

  const mapping = input.mapping ?? detectMapping(table.value.rows);
  if (!mapping || !isValidMapping(mapping, header.length)) {
    return err({ code: "import.mapping_not_detected" });
  }

  const { rows, errors } = normalizeRows(data, mapping, input.currency);
  const fingerprints = fingerprintRows(input.accountId, rows);
  const analyzed = rows.map((row, i) => ({ ...row, fingerprint: fingerprints[i] as Uint8Array }));
  const dates = rows.map((r) => r.date).sort();

  return ok({
    fileSha256: fileSha256(input.bytes),
    delimiter: table.value.delimiter,
    header,
    mapping,
    rows: analyzed,
    errors,
    skipped: 0,
    template: null,
    summary: {
      dataRows: data.length,
      validRows: rows.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      hasBalance: mapping.balanceColumn !== null,
    },
  });
}

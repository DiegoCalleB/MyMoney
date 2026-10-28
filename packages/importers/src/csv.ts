import { err, ok, type DomainError, type Result } from "@mymoney/finance-core";

export type Delimiter = ";" | "," | "\t";

export interface CsvTable {
  readonly delimiter: Delimiter;
  /** Todas las filas, cabecera incluida; las líneas vacías no cuentan. */
  readonly rows: readonly (readonly string[])[];
}

export interface CsvLimits {
  /** Filas máximas contando la cabecera. */
  readonly maxRows: number;
  readonly maxCellLength: number;
}

export const DEFAULT_LIMITS: CsvLimits = { maxRows: 20_001, maxCellLength: 2_000 };

const DELIMITERS: readonly Delimiter[] = [";", ",", "\t"];

/**
 * Decodifica los bytes de un archivo: UTF-8 (con o sin BOM) y, si no es válido, Windows-1252,
 * que es lo que suelen producir las exportaciones de hojas de cálculo en español.
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    // El decodificador de UTF-8 ya descarta el BOM inicial.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Delimitador más frecuente fuera de comillas en la primera línea con contenido. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;
  let seenContent = false;
  for (const char of text) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (char === "\n" || char === "\r")) {
      if (seenContent) break;
    } else if (!inQuotes) {
      if (char.trim() !== "") seenContent = true;
      if (char === ";" || char === "," || char === "\t") counts[char]++;
    } else {
      seenContent = true;
    }
  }
  // En empate (incluido "ninguno") gana ";", habitual en los extractos españoles.
  return DELIMITERS.reduce((best, d) => (counts[d] > counts[best] ? d : best));
}

/**
 * Lector CSV (RFC 4180): comillas, comillas dobles escapadas, saltos de línea dentro de un campo
 * y finales de línea \n, \r\n o \r. Sin dependencias y sin evaluar nada: es solo texto.
 */
export function parseCsv(
  text: string,
  limits: CsvLimits = DEFAULT_LIMITS,
  forcedDelimiter?: Delimiter,
): Result<CsvTable, DomainError> {
  const delimiter = forcedDelimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStart = true;

  const pushField = (): DomainError | null => {
    if (field.length > limits.maxCellLength) return { code: "csv.cell_too_long" };
    row.push(field);
    field = "";
    fieldStart = true;
    return null;
  };
  const pushRow = (): DomainError | null => {
    const failure = pushField();
    if (failure) return failure;
    const blank = row.length === 1 && row.join("").trim() === "";
    if (!blank) rows.push(row);
    row = [];
    return rows.length > limits.maxRows ? { code: "csv.too_many_rows" } : null;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (inQuotes) {
      if (char === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += char;
    } else if (char === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
    } else if (char === delimiter) {
      const failure = pushField();
      if (failure) return err(failure);
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text.charAt(i + 1) === "\n") i++;
      const failure = pushRow();
      if (failure) return err(failure);
    } else {
      field += char;
      fieldStart = false;
    }
  }
  if (inQuotes) return err({ code: "csv.unterminated_quote" });
  if (field !== "" || row.length > 0) {
    const failure = pushRow();
    if (failure) return err(failure);
  }
  if (rows.length === 0) return err({ code: "csv.empty" });
  return ok({ delimiter, rows });
}

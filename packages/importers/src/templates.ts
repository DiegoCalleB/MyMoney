import { createHash } from "node:crypto";
import {
  err,
  money as toMoney,
  ok,
  parseLocalizedAmount,
  type DomainError,
  type Result,
} from "@mymoney/finance-core";
import type { Analysis, AnalyzeInput } from "./analyze";
import { analyzeCsv, analyzeRows, MAX_FILE_BYTES } from "./analyze";
import {
  cleanAmount,
  normalizeText,
  parseDateCell,
  type DateFormat,
  type NumberFormat,
} from "./columns";
import { decodeText, parseCsv } from "./csv";
import { looksLikeXlsx, readXlsx } from "./xlsx";
import { fileSha256, fingerprintRows } from "./fingerprint";
import { cleanDescription, type FlowKind, type NormalizedRow, type RowError } from "./rows";

/** Qué hacer con un valor de la columna de tipo: crear ese movimiento o dejar la fila fuera. */
export type KindRule = FlowKind | "skip";

/**
 * Plantilla de una entidad: describe un formato de archivo concreto con nombres de columna
 * exactos. Es solo datos; el análisis es el mismo para todas. Si la cabecera no trae todas las
 * columnas exigidas, la plantilla no se aplica y el archivo cae al detector genérico: una
 * plantilla equivocada no importa nada, simplemente no se reconoce.
 */
export interface EntityTemplate {
  readonly id: string;
  readonly label: string;
  /** Hoja de cálculo (.xlsx) de la que se lee, si el formato es una hoja con ese nombre. */
  readonly sheet?: string;
  /** false hasta contrastar el formato con un archivo real: la interfaz lo avisa. */
  readonly verified: boolean;
  /** Columnas que deben estar en la cabecera (comparadas sin tildes ni mayúsculas). */
  readonly requiredHeaders: readonly string[];
  readonly dateColumn: string;
  readonly dateFormat: DateFormat;
  readonly amountColumn: string;
  readonly numberFormat: NumberFormat;
  readonly kindColumn: string;
  /** Valor de la columna de tipo (normalizado) → qué hacer. */
  readonly kinds: Readonly<Record<string, KindRule>>;
  /** Un valor de tipo que no está en `kinds`: fila con error (visible) u omitida (se cuenta). */
  readonly unknownKind: "error" | "skip";
  readonly descriptionColumns: readonly string[];
  /** Identificador de operación de la entidad: sustituye a la huella por tupla (ADR-0008). */
  readonly idColumn: string | null;
  /** Si existe, solo cuentan las filas cuya moneda es la de la cuenta; el resto se omite. */
  readonly currencyColumn: string | null;
}

/** El importe de un movimiento de entrada es positivo y el de uno de salida, negativo. */
const OUTFLOWS: ReadonlySet<FlowKind> = new Set(["expense", "withdrawal"]);

/** Texto de una celda; una fila más corta que la cabecera da texto vacío. */
function cell(cells: readonly string[], index: number): string {
  return cells[index] ?? "";
}

/** Índice de cada columna por nombre normalizado; la primera gana si se repite. */
function headerIndex(header: readonly string[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, i) => {
    const key = normalizeText(name);
    if (!map.has(key)) map.set(key, i);
  });
  return map;
}

/** La plantilla cuya cabecera exige columnas que el archivo trae, o null. */
export function matchTemplate(
  header: readonly string[],
  templates: readonly EntityTemplate[],
): EntityTemplate | null {
  const index = headerIndex(header);
  return (
    templates.find((t) =>
      [...t.requiredHeaders, t.dateColumn, t.amountColumn, t.kindColumn].every((h) =>
        index.has(normalizeText(h)),
      ),
    ) ?? null
  );
}

function idFingerprint(accountId: string, id: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`${accountId}|id|${id}`, "utf8").digest());
}

/** Analiza un archivo con una plantilla de entidad ya reconocida. */
function applyTemplate(
  rowsOfFile: readonly (readonly string[])[],
  template: EntityTemplate,
  input: AnalyzeInput,
  fileHash: Uint8Array,
  delimiter: Analysis["delimiter"],
): Result<Analysis, DomainError> {
  const [header = [], ...data] = rowsOfFile;
  if (data.length === 0) return err({ code: "import.no_data" });
  const index = headerIndex(header);
  // matchTemplate ya comprobó que estas columnas existen.
  const col = (name: string): number => index.get(normalizeText(name)) as number;
  const dateCol = col(template.dateColumn);
  const amountCol = col(template.amountColumn);
  const kindCol = col(template.kindColumn);
  const currencyCol = template.currencyColumn === null ? null : col(template.currencyColumn);
  const idCol = template.idColumn === null ? null : col(template.idColumn);
  const descCols = template.descriptionColumns
    .map((name) => index.get(normalizeText(name)))
    .filter((i): i is number => i !== undefined);

  const rows: NormalizedRow[] = [];
  const ids: (string | null)[] = [];
  const errors: RowError[] = [];
  let skipped = 0;

  data.forEach((cells, position) => {
    const rowIndex = position + 1;
    const fail = (code: RowError["code"]) => {
      errors.push({ index: rowIndex, code });
    };
    const rule = template.kinds[normalizeText(cell(cells, kindCol))];
    if (rule === undefined && template.unknownKind === "error") {
      fail("row.kind_unknown");
      return;
    }
    if (rule === undefined || rule === "skip") {
      skipped += 1;
      return;
    }
    if (currencyCol !== null && cell(cells, currencyCol).trim().toUpperCase() !== input.currency) {
      skipped += 1;
      return;
    }
    const date = parseDateCell(cell(cells, dateCol), template.dateFormat);
    if (!date) {
      fail("row.date_invalid");
      return;
    }
    const cleaned = cleanAmount(cell(cells, amountCol), template.numberFormat);
    if (cleaned === null) {
      fail("row.amount_missing");
      return;
    }
    const parsed = parseLocalizedAmount(cleaned, input.currency);
    if (!parsed) {
      fail("row.amount_invalid");
      return;
    }
    // El signo lo da el tipo, no el archivo: cada entidad lo escribe a su manera.
    const magnitude = parsed.minor < 0n ? -parsed.minor : parsed.minor;
    if (magnitude === 0n) {
      fail("row.amount_zero");
      return;
    }
    if (magnitude > 10n ** 15n) {
      fail("row.amount_too_large");
      return;
    }
    const minor = OUTFLOWS.has(rule) ? -magnitude : magnitude;
    const description = cleanDescription(
      descCols
        .map((i) => cell(cells, i).trim())
        .filter((text) => text !== "")
        .join(" · "),
    );
    rows.push({
      index: rowIndex,
      date,
      description,
      amount: toMoney(minor, input.currency),
      balanceAfter: null,
      kind: rule,
    });
    ids.push(idCol === null ? null : cell(cells, idCol).trim() || null);
  });

  const tuple = fingerprintRows(input.accountId, rows);
  const analyzed = rows.map((row, i) => {
    const id = ids[i] ?? null;
    return {
      ...row,
      fingerprint: id === null ? (tuple[i] as Uint8Array) : idFingerprint(input.accountId, id),
    };
  });
  const dates = rows.map((r) => r.date).sort();
  return ok({
    fileSha256: fileHash,
    delimiter,
    header,
    // Las plantillas no usan el mapeo genérico; se devuelve uno de relleno coherente con la cabecera.
    mapping: {
      dateColumn: dateCol,
      dateFormat: template.dateFormat,
      descriptionColumn: descCols[0] ?? null,
      amount: { kind: "single", column: amountCol },
      balanceColumn: null,
      numberFormat: template.numberFormat,
    },
    rows: analyzed,
    errors,
    skipped,
    template: { id: template.id, label: template.label, verified: template.verified },
    summary: {
      dataRows: data.length,
      validRows: rows.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      hasBalance: false,
    },
  });
}

/** Hoja de cálculo: la plantilla cuya hoja y cabecera encajan, o el detector genérico en la primera hoja. */
function analyzeWorkbook(
  input: AnalyzeInput,
  templates: readonly EntityTemplate[],
): Result<Analysis, DomainError> {
  const hash = fileSha256(input.bytes);
  if (!input.mapping) {
    for (const template of templates) {
      if (template.sheet === undefined) continue;
      const book = readXlsx(input.bytes, template.sheet);
      const rows = book.ok ? book.value.sheet.rows : [];
      if (rows[0] && matchTemplate(rows[0], [template])) {
        return applyTemplate(rows, template, input, hash, null);
      }
    }
  }
  const first = readXlsx(input.bytes);
  if (!first.ok) return first;
  return analyzeRows(first.value.sheet.rows, null, input);
}

/**
 * Analiza un extracto (CSV o .xlsx): si la cabecera corresponde a una plantilla de entidad la
 * aplica y, si no, usa el detector genérico de columnas. Mismos límites y mismos códigos de error
 * en ambos casos.
 */
export function analyzeStatement(
  input: AnalyzeInput,
  templates: readonly EntityTemplate[],
): Result<Analysis, DomainError> {
  if (input.bytes.length > MAX_FILE_BYTES) return err({ code: "import.file_too_large" });
  if (looksLikeXlsx(input.bytes)) return analyzeWorkbook(input, templates);
  const table = parseCsv(decodeText(input.bytes));
  if (!table.ok) return table;
  // parseCsv devuelve error si el archivo está vacío, así que siempre hay cabecera.
  const header = table.value.rows[0] as readonly string[];
  const template = input.mapping ? null : matchTemplate(header, templates);
  if (!template) return analyzeCsv(input);
  return applyTemplate(
    table.value.rows,
    template,
    input,
    fileSha256(input.bytes),
    table.value.delimiter,
  );
}

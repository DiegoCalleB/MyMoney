// Lector de hojas de cálculo .xlsx (Office Open XML) sin dependencias y a la defensiva: un archivo
// subido por una persona es entrada NO fiable. Solo lee texto y números; nunca evalúa fórmulas,
// macros ni enlaces externos, y rechaza lo que se sale de los límites (bombas de compresión,
// ZIP64, cifrado, DOCTYPE/ENTITY, hojas enormes).
import { crc32, inflateRawSync } from "node:zlib";
import { err, ok, type DomainError, type Result } from "@mymoney/finance-core";
import { dec } from "@mymoney/finance-core";

export interface XlsxLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCellLength: number;
  readonly maxSharedStrings: number;
}

export const XLSX_LIMITS: XlsxLimits = {
  /** Archivos dentro del ZIP. */
  maxEntries: 200,
  /** Tamaño descomprimido de cada parte. */
  maxEntryBytes: 20 * 1024 * 1024,
  /** Suma descomprimida de las partes que se leen. */
  maxTotalBytes: 40 * 1024 * 1024,
  maxRows: 20_001,
  maxColumns: 200,
  maxCellLength: 2_000,
  maxSharedStrings: 200_000,
};

export interface Sheet {
  readonly name: string;
  /** Filas con todas las celdas como texto; las filas vacías se omiten, como en un CSV. */
  readonly rows: readonly (readonly string[])[];
}

export interface Workbook {
  readonly sheetNames: readonly string[];
  readonly sheet: Sheet;
}

const fail = (code: string): Result<never, DomainError> => err({ code });

/** ¿Empieza como un ZIP? (los .xlsx lo son). */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly localOffset: number;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Directorio central del ZIP, con todas las comprobaciones de límites. */
function readDirectory(bytes: Uint8Array, limits: XlsxLimits): Result<ZipEntry[], DomainError> {
  const dv = view(bytes);
  // Registro de fin de directorio (EOCD): en los últimos 22 + 65535 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return fail("xlsx.invalid_zip");
  const total = dv.getUint16(eocd + 10, true);
  const dirSize = dv.getUint32(eocd + 12, true);
  const dirOffset = dv.getUint32(eocd + 16, true);
  if (dv.getUint16(eocd + 4, true) !== 0 || dv.getUint16(eocd + 6, true) !== 0) {
    return fail("xlsx.unsupported_zip");
  }
  if (total === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) {
    return fail("xlsx.unsupported_zip"); // ZIP64
  }
  if (total > limits.maxEntries) return fail("xlsx.too_many_entries");
  if (dirOffset + dirSize > eocd) return fail("xlsx.invalid_zip");

  const entries: ZipEntry[] = [];
  let p = dirOffset;
  for (let n = 0; n < total; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50)
      return fail("xlsx.invalid_zip");
    const flags = dv.getUint16(p + 8, true);
    const nameLength = dv.getUint16(p + 28, true);
    const extraLength = dv.getUint16(p + 30, true);
    const commentLength = dv.getUint16(p + 32, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const localOffset = dv.getUint32(p + 42, true);
    if (p + 46 + nameLength > bytes.length) return fail("xlsx.invalid_zip");
    if ((flags & 1) !== 0) return fail("xlsx.encrypted");
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) {
      return fail("xlsx.unsupported_zip");
    }
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLength)),
      method: dv.getUint16(p + 10, true),
      crc: dv.getUint32(p + 16, true),
      compressedSize,
      size,
      localOffset,
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return ok(entries);
}

/** Contenido de una parte del ZIP, con tope de tamaño y comprobación del CRC. */
function readEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  budget: { left: number },
  limits: XlsxLimits,
): Result<Uint8Array, DomainError> {
  if (entry.size > limits.maxEntryBytes || entry.size > budget.left) return fail("xlsx.too_large");
  const dv = view(bytes);
  const o = entry.localOffset;
  if (o + 30 > bytes.length || dv.getUint32(o, true) !== 0x04034b50)
    return fail("xlsx.invalid_zip");
  const start = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) return fail("xlsx.invalid_zip");
  const raw = bytes.subarray(start, end);

  let data: Uint8Array;
  if (entry.method === 0) {
    data = raw;
  } else if (entry.method === 8) {
    try {
      // maxOutputLength corta una bomba de compresión aunque el tamaño declarado mienta.
      data = inflateRawSync(raw, { maxOutputLength: entry.size });
    } catch {
      return fail("xlsx.too_large");
    }
  } else {
    return fail("xlsx.unsupported_zip");
  }
  if (data.length !== entry.size || crc32(data) !== entry.crc) return fail("xlsx.invalid_zip");
  budget.left -= data.length;
  return ok(data);
}

const ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:#x([0-9a-fA-F]{1,6})|#(\d{1,7})|(\w+));/g, (match, hex, num, name) => {
    if (typeof name === "string") return ENTITIES[name] ?? match;
    const code = typeof hex === "string" ? parseInt(hex, 16) : Number(num);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : match;
  });
}

/** Texto de todos los `<t>` de un fragmento (cadenas con formato incluidas; sin la fonética). */
function textOf(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of withoutPhonetic.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g))
    out += m[1] ?? "";
  return decodeEntities(out);
}

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
}

/** Letras de columna → índice desde 0 ("A" → 0, "AA" → 26). */
function columnIndex(letters: string): number {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

const decoder = new TextDecoder("utf-8");
const text = (data: Uint8Array) => decoder.decode(data);
const hasDtd = (xml: string) => /<!DOCTYPE|<!ENTITY/i.test(xml);

function sharedStrings(xml: string, limits: XlsxLimits): Result<string[], DomainError> {
  const list: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    if (list.length >= limits.maxSharedStrings) return fail("xlsx.too_large");
    list.push(textOf(m[1] ?? ""));
  }
  return ok(list);
}

function numeric(value: string): string {
  if (!/[eE]/.test(value)) return value;
  try {
    return dec(value).toFixed();
  } catch {
    return value;
  }
}

function parseSheet(
  xml: string,
  strings: readonly string[],
  limits: XlsxLimits,
): Result<string[][], DomainError> {
  const rows: string[][] = [];
  let sequentialRow = 0;
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attr(rowMatch[1] as string, "r") ?? sequentialRow + 1);
    sequentialRow = rowNumber;
    if (rowNumber > limits.maxRows) return fail("xlsx.too_many_rows");
    const cells: string[] = [];
    let sequentialColumn = 0;
    for (const c of (rowMatch[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] as string;
      const ref = /^([A-Z]{1,3})\d+$/.exec(attr(attrs, "r") ?? "");
      const index = ref ? columnIndex(ref[1] as string) : sequentialColumn;
      sequentialColumn = index + 1;
      if (index >= limits.maxColumns) return fail("xlsx.too_many_columns");
      const body = c[2] ?? "";
      const type = attr(attrs, "t");
      let value: string;
      if (type === "inlineStr") {
        value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      } else {
        const raw = decodeEntities(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
        if (type === "s") value = strings[Number(raw)] ?? "";
        else if (type === "str" || type === "e") value = raw;
        else if (type === "b") value = raw === "1" ? "1" : "0";
        else value = numeric(raw);
      }
      if (value.length > limits.maxCellLength) return fail("xlsx.cell_too_long");
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    if (cells.some((v) => v.trim() !== "")) rows[rowNumber - 1] = cells;
  }
  // filter no visita los huecos de un array disperso: quedan solo las filas con contenido.
  return ok(rows.filter((row) => row.length > 0));
}

/**
 * Lee una hoja de un .xlsx: la llamada `sheet` (sin distinguir mayúsculas) o, si no se pide, la
 * primera. `sheetNames` lista todas para que el llamante pueda elegir.
 */
export function readXlsx(
  bytes: Uint8Array,
  wanted?: string,
  limits: XlsxLimits = XLSX_LIMITS,
): Result<Workbook, DomainError> {
  const directory = readDirectory(bytes, limits);
  if (!directory.ok) return directory;
  const byName = new Map(directory.value.map((e) => [e.name, e]));
  const budget = { left: limits.maxTotalBytes };
  const read = (name: string): Result<string, DomainError> => {
    const entry = byName.get(name);
    if (!entry) return fail("xlsx.missing_part");
    const data = readEntry(bytes, entry, budget, limits);
    if (!data.ok) return data;
    const xml = text(data.value);
    return hasDtd(xml) ? fail("xlsx.forbidden_xml") : ok(xml);
  };

  const workbook = read("xl/workbook.xml");
  if (!workbook.ok) return workbook;
  const rels = read("xl/_rels/workbook.xml.rels");
  if (!rels.ok) return rels;
  const targets = new Map<string, string>();
  for (const m of rels.value.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1] as string, "Id");
    const target = attr(m[1] as string, "Target");
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const sheets = [...workbook.value.matchAll(/<sheet\b([^>]*?)\/?>/g)].flatMap((m) => {
    const name = attr(m[1] as string, "name");
    const id = attr(m[1] as string, "r:id");
    const path = id ? targets.get(id) : undefined;
    return name !== undefined && path ? [{ name: decodeEntities(name), path }] : [];
  });
  if (sheets.length === 0) return fail("xlsx.no_sheets");
  const chosen =
    wanted === undefined
      ? sheets[0]
      : sheets.find((s) => s.name.toLocaleLowerCase("es-ES") === wanted.toLocaleLowerCase("es-ES"));
  if (!chosen) return fail("xlsx.sheet_not_found");

  let strings: string[] = [];
  if (byName.has("xl/sharedStrings.xml")) {
    const shared = read("xl/sharedStrings.xml");
    if (!shared.ok) return shared;
    const parsed = sharedStrings(shared.value, limits);
    if (!parsed.ok) return parsed;
    strings = parsed.value;
  }
  const sheetXml = read(chosen.path);
  if (!sheetXml.ok) return sheetXml;
  const rows = parseSheet(sheetXml.value, strings, limits);
  if (!rows.ok) return rows;
  return ok({
    sheetNames: sheets.map((s) => s.name),
    sheet: { name: chosen.name, rows: rows.value },
  });
}

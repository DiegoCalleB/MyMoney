// Escritor de ZIP mínimo para fabricar .xlsx de prueba (y archivos manipulados a propósito).
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipSpec {
  readonly name: string;
  readonly data: string | Uint8Array;
  /** 8 = deflate (por defecto), 0 = almacenado. */
  readonly method?: number;
  readonly flags?: number;
  /** Tamaño descomprimido declarado, para fabricar mentiras. */
  readonly declaredSize?: number;
  readonly declaredCrc?: number;
  /** Tamaño comprimido declarado en el directorio central. */
  readonly declaredCompressed?: number;
  readonly localOffsetOverride?: number;
  readonly zip64Sizes?: boolean;
  /** Longitud del nombre declarada en el directorio central. */
  readonly declaredNameLength?: number;
}

export interface ZipOptions {
  readonly entriesOverride?: number;
  readonly diskNumber?: number;
  readonly dirOffsetOverride?: number;
  readonly dirSizeOverride?: number;
  readonly noEocd?: boolean;
  readonly badLocalSignature?: boolean;
}

const u16 = (n: number) => Uint8Array.of(n & 255, (n >> 8) & 255);
const u32 = (n: number) =>
  Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
const join = (parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));
const bytesOf = (v: string | Uint8Array) =>
  typeof v === "string" ? new TextEncoder().encode(v) : v;

export function zip(specs: readonly ZipSpec[], options: ZipOptions = {}): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const spec of specs) {
    const raw = bytesOf(spec.data);
    const method = spec.method ?? 8;
    const payload = method === 8 ? deflateRawSync(raw) : raw;
    const name = new TextEncoder().encode(spec.name);
    const crc = spec.declaredCrc ?? crc32(raw);
    const size = spec.declaredSize ?? raw.length;
    const header = join([
      u32(options.badLocalSignature ? 0 : 0x04034b50),
      u16(20),
      u16(spec.flags ?? 0),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(payload.length),
      u32(raw.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    local.push(header, payload);
    central.push(
      join([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(spec.flags ?? 0),
        u16(method),
        u16(0),
        u16(0),
        u32(crc),
        u32(spec.zip64Sizes ? 0xffffffff : (spec.declaredCompressed ?? payload.length)),
        u32(size),
        u16(spec.declaredNameLength ?? name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(spec.localOffsetOverride ?? offset),
        name,
      ]),
    );
    offset += header.length + payload.length;
  }
  const directory = join(central);
  const eocd = join([
    u32(options.noEocd ? 0 : 0x06054b50),
    u16(options.diskNumber ?? 0),
    u16(0),
    u16(specs.length),
    u16(options.entriesOverride ?? specs.length),
    u32(options.dirSizeOverride ?? directory.length),
    u32(options.dirOffsetOverride ?? offset),
    u16(0),
  ]);
  return join([...local, directory, eocd]);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** .xlsx pequeño con las partes estándar. */
export function xlsx(opts: {
  sheets: { name: string; xml: string }[];
  sharedStrings?: string;
  absoluteTargets?: boolean;
  workbookXml?: string;
  extra?: ZipSpec[];
}): Uint8Array {
  const workbook =
    opts.workbookXml ??
    `${XML}<workbook xmlns:r="x"><sheets>${opts.sheets
      .map(
        (s, i) => `<sheet name="${s.name}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`,
      )
      .join("")}</sheets></workbook>`;
  const rels = `${XML}<Relationships>${opts.sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${String(i + 1)}" Type="worksheet" Target="${
          opts.absoluteTargets ? "/xl/" : ""
        }worksheets/sheet${String(i + 1)}.xml"/>`,
    )
    .join("")}</Relationships>`;
  return zip([
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: rels },
    ...(opts.sharedStrings === undefined
      ? []
      : [{ name: "xl/sharedStrings.xml", data: opts.sharedStrings }]),
    ...opts.sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${String(i + 1)}.xml`,
      data: `${XML}<worksheet><sheetData>${s.xml}</sheetData></worksheet>`,
    })),
    ...(opts.extra ?? []),
  ]);
}

import {
  calendarDate,
  err,
  isCalendarDate,
  ok,
  parseAmount,
  type CurrencyCode,
  type DomainError,
  type Result,
} from "@mymoney/finance-core";
import { fileSha256, fingerprintRows, toHex } from "./fingerprint";
import { cleanDescription, type NormalizedRow } from "./rows";
import { normalizeText } from "./columns";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Categorías que ING pone a cada movimiento; sirven para separar el concepto de la categoría. */
export const ING_CATEGORIES = [
  "Agua",
  "Belleza, peluquería y perfumería",
  "Cafeterías y restaurantes",
  "Cine, teatro y espectáculos",
  "Compras (otros)",
  "Decoración y mobiliario",
  "Deporte y gimnasio",
  "Dentista, médico",
  "Educación",
  "Electrónica",
  "Farmacia, herbolario y nutrición",
  "Gasolina y combustible",
  "Gasto Bizum",
  "Ingreso Bizum",
  "Ingresos de otras entidades",
  "Libros, música y videojuegos",
  "Luz y gas",
  "Mantenimiento de vehículo",
  "Mantenimiento del hogar",
  "Nómina o Pensión",
  "Ocio y viajes (otros)",
  "Otros ingresos (otros)",
  "Pago de impuestos",
  "Parking y garaje",
  "Redondeo",
  "Regalos y juguetes",
  "Ropa y complementos",
  "Supermercados y alimentación",
  "Taxis y Carsharing",
  "Teléfono, TV e internet",
  "Transferencias",
  "Traspaso entre cuentas",
] as const;

const BY_LENGTH = [...ING_CATEGORIES].sort((a, b) => b.length - a.length);

/** Categorías que mueven dinero entre cuentas propias: no son ingreso ni gasto. */
const INTERNAL_CATEGORIES = new Set<string>(["Redondeo", "Traspaso entre cuentas"]);

export const MAX_ING_ENTRIES = 5000;
export const MAX_ING_TEXT = 2 * 1024 * 1024;

export interface IngEntry extends NormalizedRow {
  /** Categoría que ING asignó, si el concepto la trae. */
  readonly category: string | null;
  /** Traspaso entre cuentas propias o redondeo: no se importa como ingreso ni gasto. */
  readonly internal: boolean;
}

export interface IngParseResult {
  readonly entries: readonly IngEntry[];
  /** Movimientos «retenidos» (sin saldo): aún no están liquidados y no se importan. */
  readonly pending: number;
  /** Trozos con aspecto de movimiento que no se han podido leer. */
  readonly unreadable: number;
}

export interface IngParseOptions {
  readonly currency?: CurrencyCode;
  /** Nombres de la persona tal como salen en ING, para reconocer transferencias a sí misma. */
  readonly ownNames?: readonly string[];
}

const TOKEN = /(?:\[[^\]]*\]\([^)\s]*\))+/g;
const INNER = /\[([^\]]*)\]\([^)\s]*\)/g;
const ENTRY =
  /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4}),\s*([\s\S]*?),\s*Importe:\s*(-?\d+(?:\.\d+)?)\s*€(?:,\s*Balance tras este movimiento:\s*(-?\d+(?:\.\d+)?)\s*€)?\s*$/;

/** Separa «concepto, categoría[, nota]»: la nota que escribió la persona se descarta. */
function splitMiddle(middle: string): { description: string; category: string | null } {
  let best: { index: number; category: string } | null = null;
  for (const category of BY_LENGTH) {
    const marker = `, ${category}`;
    for (let from = middle.indexOf(marker); from !== -1; from = middle.indexOf(marker, from + 1)) {
      const next = middle.slice(from + marker.length, from + marker.length + 2);
      if ((next === "" || next.startsWith(",")) && (best === null || from < best.index)) {
        best = { index: from, category };
        break;
      }
    }
  }
  return best
    ? { description: middle.slice(0, best.index), category: best.category }
    : { description: middle, category: null };
}

/**
 * Concepto sin datos de terceros: de los Bizum y las transferencias solo queda el tipo (el
 * nombre de quien envía o recibe no se guarda); de los pagos con tarjeta, el comercio.
 */
function publicDescription(raw: string): string {
  const text = cleanDescription(raw);
  if (/^Bizum enviado/i.test(text)) return "Bizum enviado";
  if (/^Bizum recibido/i.test(text)) return "Bizum recibido";
  if (/^Transferencia emitida/i.test(text)) return "Transferencia emitida";
  if (/^Transferencia recibida/i.test(text)) return "Transferencia recibida";
  if (/^Traspaso .*emitido/i.test(text)) return "Traspaso emitido";
  if (/^Traspaso .*recibido/i.test(text)) return "Traspaso recibido";
  if (/^Nomina recibida/i.test(text)) return "Nómina";
  return text.replace(/^Pago en\s+/i, "");
}

/**
 * Lee el texto que se copia de la web de ING («Movimientos»): cada movimiento aparece como un
 * enlace `[fecha, concepto, categoría, …, Importe: X €, Balance tras este movimiento: Y €](…)`,
 * a veces partido en varios enlaces seguidos. El resto del texto (repeticiones, títulos) se
 * ignora. Las cifras vienen con punto decimal y sin separador de miles.
 */
export function parseIngPaste(text: string, options: IngParseOptions = {}): IngParseResult {
  const currency = options.currency ?? "EUR";
  const own = (options.ownNames ?? []).map((n) => normalizeText(n)).filter((n) => n !== "");
  const entries: IngEntry[] = [];
  let pending = 0;
  let unreadable = 0;

  for (const run of text.matchAll(TOKEN)) {
    const joined = [...run[0].matchAll(INNER)].map((m) => m[1] as string).join("");
    const match = ENTRY.exec(joined.trim());
    if (!match) {
      unreadable += 1;
      continue;
    }
    const [, dayText = "", monthText = "", year = "", middle = "", amountText = "", balanceText] =
      match;
    const month = MONTHS.indexOf(monthText) + 1;
    const iso = `${year}-${String(month).padStart(2, "0")}-${dayText.padStart(2, "0")}`;
    const amount = parseAmount(amountText, currency, ".");
    const balance = balanceText === undefined ? null : parseAmount(balanceText, currency, ".");
    if (month === 0 || !isCalendarDate(iso) || !amount || amount.minor === 0n) {
      unreadable += 1;
      continue;
    }
    if (balanceText === undefined) {
      pending += 1;
      continue;
    }
    if (!balance) {
      unreadable += 1;
      continue;
    }
    const { description, category } = splitMiddle(middle);
    const normalized = normalizeText(description);
    const toSelf =
      /^(transferencia|traspaso)/.test(normalized) && own.some((name) => normalized.includes(name));
    entries.push({
      index: entries.length + 1,
      date: calendarDate(iso),
      description: publicDescription(description),
      amount,
      balanceAfter: balance,
      category,
      internal: (category !== null && INTERNAL_CATEGORIES.has(category)) || toSelf,
    });
  }
  return { entries, pending, unreadable };
}

export interface IngAnalysis {
  /** Movimientos que se importarían (sin traspasos propios ni retenidos), numerados desde 1. */
  readonly rows: readonly IngEntry[];
  readonly fingerprints: readonly string[];
  /** Huella del conjunto, igual para el mismo texto aunque venga en otro orden. */
  readonly fileSha256: string;
  readonly internal: number;
  readonly pending: number;
  readonly unreadable: number;
}

/** Lee el texto, descarta lo que no es ingreso ni gasto y calcula las huellas de lo que queda. */
export function analyzeIngPaste(
  text: string,
  accountId: string,
  options: IngParseOptions = {},
): Result<IngAnalysis, DomainError> {
  if (text.length > MAX_ING_TEXT) return err({ code: "import.file_too_large" });
  const parsed = parseIngPaste(text, options);
  if (parsed.entries.length === 0) return err({ code: "import.no_data" });
  const rows = parsed.entries.filter((e) => !e.internal).map((e, i) => ({ ...e, index: i + 1 }));
  if (rows.length === 0) return err({ code: "import.no_data" });
  if (rows.length > MAX_ING_ENTRIES) return err({ code: "import.too_many_rows" });
  const fingerprints = fingerprintRows(accountId, rows).map(toHex);
  const digest = fileSha256(Buffer.from([...fingerprints].sort().join(","), "utf8"));
  return ok({
    rows,
    fingerprints,
    fileSha256: toHex(digest),
    internal: parsed.entries.length - rows.length,
    pending: parsed.pending,
    unreadable: parsed.unreadable,
  });
}

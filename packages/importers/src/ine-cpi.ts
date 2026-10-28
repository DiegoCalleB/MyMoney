/**
 * Lector de la serie del IPC que publica el INE (API Tempus). Sin dependencias: lo importan
 * tanto los tests (Node) como la función de Supabase (Deno), que lo carga por ruta.
 *
 * Serie usada: IPC251852, «Nacional. Índice general. Índice», unidad «Índice» (133), mensual y
 * encadenada a la base vigente. Comprobado con la API el 28-10-2026: los periodos mensuales
 * vienen como `FK_Periodo` 1-12 y `Anyo`; `Fecha` es medianoche en España y por eso no se usa
 * (cambia de día UTC con el horario de verano). `Valor` llega como número JSON con 3 decimales.
 */
export const INE_CPI_SERIES = "IPC251852";
/** Identificador de la unidad «Índice» en el INE: evita confundir el índice con una variación. */
export const INE_UNIT_INDEX = 133;

/** Dirección de la serie completa desde `sinceYear`. Sin parámetro de fechas la API da un 404. */
export function ineCpiUrl(series: string = INE_CPI_SERIES, sinceYear = 2002): string {
  return `https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${series}?date=${String(sinceYear)}0101:`;
}

export interface CpiObservation {
  /** Primer día del mes, "2026-08-01". */
  readonly period: string;
  /** Índice como texto decimal ("119.942"): nunca pasa a coma flotante después de leerlo. */
  readonly index: string;
}

export interface IneCpiSeries {
  readonly series: string;
  readonly name: string;
  readonly observations: readonly CpiObservation[];
}

export interface IneCpiError {
  readonly code:
    | "ine.invalid_response"
    | "ine.unexpected_series"
    | "ine.unexpected_unit"
    | "ine.no_data"
    | "ine.invalid_observation"
    | "ine.duplicate_period";
  readonly params?: Readonly<Record<string, string>>;
}

export type IneCpiResult =
  | { readonly ok: true; readonly value: IneCpiSeries }
  | { readonly ok: false; readonly error: IneCpiError };

const fail = (code: IneCpiError["code"], params?: Record<string, string>): IneCpiResult => ({
  ok: false,
  error: params ? { code, params } : { code },
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Convierte la respuesta de `DATOS_SERIE` en observaciones mensuales ordenadas. Un dato
 * secreto se omite; cualquier otra anomalía (serie o unidad distintas, mes imposible, valor no
 * positivo o con más de 4 decimales, mes repetido) falla en lugar de guardar un índice dudoso.
 */
export function parseIneCpi(input: unknown, expectedSeries: string = INE_CPI_SERIES): IneCpiResult {
  if (!isRecord(input) || typeof input.COD !== "string" || !Array.isArray(input.Data)) {
    return fail("ine.invalid_response");
  }
  if (input.COD !== expectedSeries) return fail("ine.unexpected_series", { series: input.COD });
  if (input.FK_Unidad !== INE_UNIT_INDEX) {
    return fail("ine.unexpected_unit", { unit: String(input.FK_Unidad) });
  }

  const byPeriod = new Map<string, string>();
  for (const [position, item] of input.Data.entries()) {
    const where = { position: String(position) };
    if (!isRecord(item)) return fail("ine.invalid_observation", where);
    if (item.Secreto === true) continue;
    const { Anyo: year, FK_Periodo: month, Valor: value } = item;
    if (
      typeof year !== "number" ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 2200 ||
      typeof month !== "number" ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      typeof value !== "number" ||
      !(value > 0) ||
      value >= 1e8 ||
      Number(value.toFixed(4)) !== value
    ) {
      return fail("ine.invalid_observation", where);
    }
    const period = `${String(year)}-${String(month).padStart(2, "0")}-01`;
    if (byPeriod.has(period)) return fail("ine.duplicate_period", { period });
    byPeriod.set(period, String(value));
  }
  if (byPeriod.size === 0) return fail("ine.no_data");

  const observations = [...byPeriod]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([period, index]) => ({ period, index }));
  return {
    ok: true,
    value: {
      series: input.COD,
      name: typeof input.Nombre === "string" ? input.Nombre.trim() : "",
      observations,
    },
  };
}

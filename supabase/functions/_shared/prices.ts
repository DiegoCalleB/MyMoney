// Lógica pura de los precios automáticos de criptoactivos. Sin dependencias: la usa una Edge
// Function (Deno) y la prueban los tests de Node. Nunca registra importes ni identificadores.

export interface PriceRow {
  readonly instrument: string;
  readonly as_of: string;
  /** Cadena decimal: los precios no pasan por `number` (regla 13). */
  readonly price: string;
  readonly currency: string;
  readonly source: string;
}

export const PRICE_SOURCE = "binance:spot";
/** Binance admite hasta 100 símbolos por petición de precios. */
export const MAX_SYMBOLS_PER_REQUEST = 100;

const TICKER = /^[A-Z0-9]{2,12}$/;
// Hasta 18 cifras enteras y 12 decimales: cabe en numeric(28, 10) de ref.prices sin redondear.
const DECIMAL = /^\d{1,18}(\.\d{1,10})?$/;
const ZERO = /^0+(\.0+)?$/;

export function isTicker(value: string): boolean {
  return TICKER.test(value);
}

/** Pares `<TICKER><MONEDA>` sin repetir ni incluir la propia moneda, ordenados. */
export function tickerSymbols(tickers: readonly string[], quote: string): string[] {
  const valid = new Set(tickers.map((t) => t.toUpperCase()).filter((t) => isTicker(t) && t !== quote));
  return [...valid].sort().map((t) => `${t}${quote}`);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

export function buildTickerUrl(base: string, symbols: readonly string[]): string {
  return `${base}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
}

/** Fecha UTC del día (AAAA-MM-DD): se pasa el instante, la función no lee el reloj. */
export function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Convierte la respuesta de precios en filas válidas. Lo que no encaja (símbolo de otra moneda,
 * precio mal formado o cero) se descarta y se cuenta, sin detener al resto.
 */
export function parseTickerPrices(
  json: unknown,
  quote: string,
  asOf: string,
): { rows: PriceRow[]; rejected: number } {
  if (!Array.isArray(json)) return { rows: [], rejected: 1 };
  const rows: PriceRow[] = [];
  let rejected = 0;
  for (const item of json as unknown[]) {
    const entry = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const { symbol, price } = entry;
    const instrument =
      typeof symbol === "string" && symbol.endsWith(quote) ? symbol.slice(0, -quote.length) : "";
    if (
      !isTicker(instrument) ||
      typeof price !== "string" ||
      !DECIMAL.test(price) ||
      ZERO.test(price)
    ) {
      rejected += 1;
      continue;
    }
    rows.push({ instrument, as_of: asOf, price, currency: quote, source: PRICE_SOURCE });
  }
  return { rows, rejected };
}

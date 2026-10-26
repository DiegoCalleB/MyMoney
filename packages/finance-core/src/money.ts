import { Decimal, ROUNDING, dec, type RoundingMode } from "./decimal";

/** Código ISO 4217 de una moneda soportada. */
export type CurrencyCode = keyof typeof MINOR_UNITS;

/**
 * Decimales (unidades mínimas) por moneda, según ISO 4217. Las criptomonedas no son
 * monedas sino activos (se guardan como cantidades `numeric`), por eso no aparecen aquí.
 */
export const MINOR_UNITS = {
  EUR: 2,
  USD: 2,
  GBP: 2,
  CHF: 2,
  SEK: 2,
  NOK: 2,
  DKK: 2,
  PLN: 2,
  CZK: 2,
  HUF: 2,
  CAD: 2,
  AUD: 2,
  MXN: 2,
  BRL: 2,
  CLP: 0,
  COP: 2,
  ARS: 2,
  JPY: 0,
  KRW: 0,
  KWD: 3,
} as const satisfies Record<string, 0 | 2 | 3>;

export function isCurrencyCode(code: string): code is CurrencyCode {
  return Object.hasOwn(MINOR_UNITS, code);
}

/** Importe exacto: entero de unidades mínimas + moneda. Nunca `number`. */
export interface Money {
  readonly minor: bigint;
  readonly currency: CurrencyCode;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`No se pueden combinar importes en ${a} y ${b} sin una conversión explícita`);
    this.name = "CurrencyMismatchError";
  }
}

export function money(minor: bigint, currency: CurrencyCode): Money {
  return Object.freeze({ minor, currency });
}

export function zero(currency: CurrencyCode): Money {
  return money(0n, currency);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.minor, a.currency);
}

export function isZero(a: Money): boolean {
  return a.minor === 0n;
}

/** -1, 0 o 1. Solo compara importes de la misma moneda. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.minor < b.minor ? -1 : a.minor > b.minor ? 1 : 0;
}

/** Suma una lista de importes de la moneda indicada (la moneda es obligatoria para listas vacías). */
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

/** Valor decimal en unidades principales (p. ej., 1234n EUR → 12.34). */
export function toDecimal(m: Money): Decimal {
  return dec(m.minor).div(new Decimal(10).pow(MINOR_UNITS[m.currency]));
}

/** Decimal en unidades principales → Money, con un único redondeo explícito. */
export function fromDecimal(
  value: Decimal,
  currency: CurrencyCode,
  rounding: RoundingMode = "HALF_EVEN",
): Money {
  const scaled = value
    .mul(new Decimal(10).pow(MINOR_UNITS[currency]))
    .toDecimalPlaces(0, ROUNDING[rounding]);
  return money(BigInt(scaled.toFixed(0)), currency);
}

/**
 * Lee un importe escrito por una persona o un CSV ("1.234,56", "-12.5", "1234") sin pasar por
 * `number`. `decimalSeparator` debe indicarse: "1.234" es ambiguo entre locales.
 */
export function parseAmount(
  text: string,
  currency: CurrencyCode,
  decimalSeparator: "," | ".",
): Money | null {
  const group = decimalSeparator === "," ? "." : ",";
  const cleaned = text
    .trim()
    .replace(/\s/g, "")
    .split(group)
    .join("")
    .replace(decimalSeparator, ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return null;
  const [, fraction = ""] = cleaned.split(".");
  if (fraction.length > MINOR_UNITS[currency]) return null;
  return fromDecimal(dec(cleaned), currency);
}

/**
 * Reparte un importe según pesos enteros sin perder ni crear unidades mínimas
 * (método del resto mayor). Los empates se resuelven a favor del primer peso.
 */
export function allocate(total: Money, weights: readonly bigint[]): Money[] {
  if (weights.length === 0) throw new RangeError("Hace falta al menos un peso");
  if (weights.some((w) => w < 0n)) throw new RangeError("Los pesos no pueden ser negativos");
  const totalWeight = weights.reduce((a, w) => a + w, 0n);
  if (totalWeight === 0n) throw new RangeError("La suma de pesos no puede ser cero");

  const sign = total.minor < 0n ? -1n : 1n;
  const amount = total.minor * sign;
  const shares = weights.map((w) => (amount * w) / totalWeight);
  const remainders = weights.map((w, i) => ({ i, r: (amount * w) % totalWeight }));
  let leftover = amount - shares.reduce((a, s) => a + s, 0n);

  remainders.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of remainders) {
    if (leftover === 0n) break;
    shares[i] = (shares[i] as bigint) + 1n;
    leftover -= 1n;
  }
  return shares.map((s) => money(s * sign, total.currency));
}

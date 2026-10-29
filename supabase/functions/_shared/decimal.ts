// Aritmética decimal exacta con BigInt, sin `number` (regla 13). Solo lo que necesitan los
// adaptadores: leer decimales, multiplicar y pasar a unidades mínimas con redondeo bancario.

export interface Fixed {
  /** Valor × 10^scale, como entero. */
  readonly int: bigint;
  readonly scale: number;
}

const DECIMAL = /^(\d{1,30})(?:\.(\d{1,30}))?$/;

/** Decimal no negativo escrito con punto ("0.00123000"); null si no es un número válido. */
export function parseFixed(value: string): Fixed | null {
  const match = DECIMAL.exec(value);
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  return { int: BigInt(whole + fraction), scale: fraction.length };
}

export function isZero(value: Fixed): boolean {
  return value.int === 0n;
}

/** a × b, exacto. */
export function multiply(a: Fixed, b: Fixed): Fixed {
  return { int: a.int * b.int, scale: a.scale + b.scale };
}

/** Pasa a unidades mínimas (p. ej., céntimos con 2) con redondeo half-even. */
export function toMinorUnits(value: Fixed, minorDigits: number): bigint {
  const shift = value.scale - minorDigits;
  if (shift <= 0) return value.int * 10n ** BigInt(-shift);
  const divisor = 10n ** BigInt(shift);
  const quotient = value.int / divisor;
  const remainder = value.int % divisor;
  const twice = remainder * 2n;
  if (twice > divisor) return quotient + 1n;
  if (twice < divisor) return quotient;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

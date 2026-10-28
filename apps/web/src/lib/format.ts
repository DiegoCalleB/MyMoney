import { MINOR_UNITS, toDecimal, type Decimal, type Money } from "@mymoney/finance-core";

const LOCALE = "es-ES";

/**
 * Importe con símbolo y decimales de su moneda, sin pasar por `number` (regla 13): `format`
 * recibe el decimal exacto como cadena. Los negativos llevan signo menos, no solo color.
 */
export function formatMoney(amount: Money): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    // Agrupa también los miles de cuatro cifras: en listas de importes se lee mejor alineado.
    useGrouping: "always",
    currency: amount.currency,
    minimumFractionDigits: MINOR_UNITS[amount.currency],
    maximumFractionDigits: MINOR_UNITS[amount.currency],
  }).format(toDecimal(amount).toFixed(MINOR_UNITS[amount.currency]) as `${number}`);
}

/**
 * Porcentaje con un decimal y signo explícito (+ / −), para que ni la ganancia ni la pérdida
 * dependan del color. Es una proporción para mostrar, no dinero.
 */
export function formatPercentSigned(ratio: Decimal): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(Number(ratio.toFixed(6)));
}

/**
 * Parte que supone `part` del `whole`, como porcentaje con un decimal. El reparto se hace en
 * `bigint` (regla 13); solo el resultado, una proporción, pasa a decimal para mostrarlo. Cadena
 * vacía si no hay un total positivo o si la parte es negativa (una deuda no es parte de lo que se tiene).
 */
export function formatShare(part: Money, whole: Money): string {
  if (whole.minor <= 0n || part.minor < 0n) return "";
  // Puntos básicos enteros, como en los gráficos: el redondeo a un decimal lo hace Intl.
  const bps = (part.minor * 10_000n) / whole.minor;
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(bps) / 10_000);
}

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

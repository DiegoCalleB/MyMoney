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
 * Tasa (0,1 = 10 %) como porcentaje con dos decimales, sin pasar por `number`. El signo va
 * siempre delante de las ganancias y pérdidas: no se informa solo con el color.
 */
export function formatPercent(rate: Decimal): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate.toFixed(8) as `${number}`);
}

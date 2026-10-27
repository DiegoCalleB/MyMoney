import { parseAmount, type CurrencyCode, type Money } from "./money";

// Agrupación de miles con punto: "1.234" o "12.345.678".
const THOUSANDS_DOT = /^[+-]?\d{1,3}(\.\d{3})+$/;
const COMMA_DECIMAL = /^[+-]?(\d{1,3}(\.\d{3})+|\d+),\d+$/;
const DOT_DECIMAL = /^[+-]?\d+\.\d+$/;
const INTEGER = /^[+-]?\d+$/;

/**
 * Lee un importe escrito por una persona en España ("1.234,56", "1234,5", "1.234", "12.5").
 *
 * La coma es el separador decimal. El punto solo se acepta si es inequívoco: agrupa miles
 * cuando forma grupos de tres cifras ("1.234" es 1234, no 1,234) y es decimal cuando le sigue
 * una fracción que no encaja como miles ("12.5"). Cualquier otra forma ambigua o mal escrita
 * devuelve `null` en lugar de adivinar: un importe equivocado por un factor 100 es peor que
 * pedir que se corrija. No pasa por `number`.
 */
export function parseLocalizedAmount(text: string, currency: CurrencyCode): Money | null {
  const value = text.replace(/\s/g, "");
  if (value.includes(",")) {
    return COMMA_DECIMAL.test(value) ? parseAmount(value, currency, ",") : null;
  }
  if (THOUSANDS_DOT.test(value)) return parseAmount(value, currency, ",");
  if (DOT_DECIMAL.test(value)) return parseAmount(value, currency, ".");
  return INTEGER.test(value) ? parseAmount(value, currency, ",") : null;
}

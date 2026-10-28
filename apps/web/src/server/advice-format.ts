import { money, type CurrencyCode, type Finding } from "@mymoney/finance-core";
import { formatMoney } from "@/lib/format";

const percent = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 });

/**
 * Parámetros de un aviso listos para el catálogo de textos: `shareBps` → «share» como
 * porcentaje, `limitBps` → «limit», `months` con coma decimal y `expense` como importe.
 */
export function adviceParams(finding: Finding, baseCurrency: CurrencyCode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(finding.params)) {
    if (key.endsWith("Bps")) out[key.slice(0, -3)] = percent.format(Number(value) / 10000);
    else if (key === "months") out[key] = value.replace(".", ",");
    else if (key === "limitMonths") out.limit = value;
    else if (key === "expense") out[key] = formatMoney(money(BigInt(value), baseCurrency));
    else out[key] = value;
  }
  return out;
}

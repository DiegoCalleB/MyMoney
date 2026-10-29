import {
  compareWithBenchmark,
  dec,
  type AccountLine,
  type BenchmarkResult,
  type CalendarDate,
  type DomainError,
  type Result,
} from "@mymoney/finance-core";
import type { ExternalFlowRow, PriceRow } from "@/server/home-model";

/**
 * Compara una cuenta con una referencia: las mismas aportaciones y retiradas de la cuenta, en
 * las mismas fechas, aplicadas al precio del instrumento elegido. Solo se usan los flujos y los
 * precios en la moneda de la cuenta; mezclar monedas exigiría un tipo de cambio con fecha.
 */
export function buildBenchmark(
  flowRows: readonly ExternalFlowRow[],
  line: AccountLine,
  priceRows: readonly PriceRow[],
  today: CalendarDate,
): Result<BenchmarkResult, DomainError> {
  const currency = line.original.currency;
  return compareWithBenchmark({
    currency,
    flows: flowRows
      .filter((r) => r.account_id === line.accountId && r.currency === currency)
      .map((r) => ({
        date: r.occurred_on,
        amount: { minor: r.amount_minor, currency },
      })),
    portfolioValue: line.original,
    prices: priceRows
      .filter((p) => p.currency === currency)
      .map((p) => ({ date: p.as_of, price: dec(p.price) })),
    onDate: today,
  });
}

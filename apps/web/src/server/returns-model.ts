import {
  add,
  returns,
  zero,
  type AccountLine,
  type CalendarDate,
  type CurrencyCode,
  type ExternalFlow,
  type ReturnsResult,
} from "@mymoney/finance-core";
import type { ExternalFlowRow } from "@/server/home-model";

export interface AccountReturns {
  readonly accountId: string;
  readonly result: ReturnsResult;
}

export interface ReturnsModel {
  readonly accounts: readonly AccountReturns[];
  /** Todas las cuentas con aportaciones en la moneda base, juntas (si hay más de una). */
  readonly total: ReturnsResult | null;
}

interface AccountInfo {
  readonly currency: CurrencyCode;
  readonly isLiability: boolean;
}

/**
 * Rentabilidad por cuenta a partir de sus aportaciones y retiradas y del valor que ya muestra
 * el patrimonio (en la moneda de la cuenta). Las deudas no tienen rentabilidad y los flujos en
 * una moneda distinta de la de la cuenta se ignoran: nunca se suman monedas distintas.
 */
export function buildReturns(
  flowRows: readonly ExternalFlowRow[],
  lines: readonly AccountLine[],
  accounts: ReadonlyMap<string, AccountInfo>,
  baseCurrency: CurrencyCode,
  today: CalendarDate,
): ReturnsModel {
  const perAccount: AccountReturns[] = [];
  const baseFlows: ExternalFlow[] = [];
  let baseValue = zero(baseCurrency);
  let baseAccounts = 0;

  for (const line of lines) {
    const info = accounts.get(line.accountId);
    if (!info || info.isLiability) continue;
    const flows: ExternalFlow[] = flowRows
      .filter((r) => r.account_id === line.accountId && r.currency === info.currency)
      .map((r) => ({
        date: r.occurred_on,
        amount: { minor: r.amount_minor, currency: r.currency },
      }));
    if (flows.length === 0 || line.original.currency !== info.currency) continue;
    const result = returns({ flows, currentValue: line.original, onDate: today });
    if (!result.ok) continue;
    perAccount.push({ accountId: line.accountId, result: result.value });
    if (info.currency === baseCurrency) {
      baseFlows.push(...flows);
      baseValue = add(baseValue, line.original);
      baseAccounts += 1;
    }
  }

  let total: ReturnsResult | null = null;
  if (baseAccounts > 1) {
    const result = returns({ flows: baseFlows, currentValue: baseValue, onDate: today });
    if (result.ok) total = result.value;
  }
  return { accounts: perAccount, total };
}

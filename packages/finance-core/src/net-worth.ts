import { daysBetween, type CalendarDate } from "./calendar-date";
import { convert, type FxExplanation, type FxRate } from "./fx";
import { add, allocate, money, negate, zero, type CurrencyCode, type Money } from "./money";
import type { DomainError } from "./result";

/** Valor observado de una cuenta: saldo del libro o valoración, con la fecha a la que se refiere. */
export interface ObservedValue {
  readonly amount: Money;
  readonly asOf: CalendarDate;
}

export interface AccountInput {
  readonly accountId: string;
  /** Hipoteca, préstamo o tarjeta: resta del patrimonio. */
  readonly isLiability: boolean;
  /** Saldo del libro (con signo: un descubierto es negativo) y fecha del último movimiento. */
  readonly ledger?: ObservedValue;
  /** Última valoración. En pasivos es lo que se debe (positivo), como guarda `valuations`. */
  readonly valuation?: ObservedValue;
}

/** Reparto vigente de una cuenta entre bolsillos (`pocket_allocations_on`). */
export interface PocketAllocationInput {
  readonly pocketId: string;
  readonly accountId: string;
  /** Reparto por posición; aún no se valoran posiciones por separado. */
  readonly assetId: string | null;
  readonly weightBps: number;
}

export interface NetWorthInput {
  readonly baseCurrency: CurrencyCode;
  /** "Hoy" en la zona del espacio: la librería no lee el reloj. */
  readonly onDate: CalendarDate;
  readonly accounts: readonly AccountInput[];
  readonly allocations: readonly PocketAllocationInput[];
  readonly fxRates: readonly FxRate[];
  /** Antigüedad a partir de la cual un valor se marca como desactualizado. */
  readonly staleAfterDays?: number;
}

export interface AccountLine {
  readonly accountId: string;
  readonly basis: "valuation" | "ledger";
  readonly asOf: CalendarDate;
  readonly original: Money;
  /** Aportación al patrimonio en la moneda base (negativa en pasivos). */
  readonly contribution: Money;
  readonly fx: FxExplanation;
  readonly ageDays: number;
  readonly stale: boolean;
}

export interface PocketTotal {
  readonly pocketId: string;
  readonly value: Money;
}

export interface NetWorth {
  readonly total: Money;
  readonly assets: Money;
  readonly liabilities: Money;
  readonly byPocket: readonly PocketTotal[];
  /** Parte del patrimonio que no está asignada a ningún bolsillo. */
  readonly unassigned: Money;
}

export interface NetWorthExplanation {
  readonly method: "net_worth.sum_of_accounts";
  readonly onDate: CalendarDate;
  readonly baseCurrency: CurrencyCode;
  /** Códigos estables (i18n) de los supuestos aplicados. */
  readonly assumptions: readonly string[];
  readonly accounts: readonly AccountLine[];
  readonly quality: {
    readonly level: "complete" | "partial";
    /** Cuentas que no suman: sin valor o sin tipo de cambio. */
    readonly excluded: readonly ({ readonly accountId: string } & DomainError)[];
    /** Cuentas que suman, pero cuyo reparto por bolsillos no se puede aplicar. */
    readonly unallocated: readonly ({ readonly accountId: string } & DomainError)[];
  };
}

export interface NetWorthResult {
  readonly value: NetWorth;
  readonly explanation: NetWorthExplanation;
}

export const DEFAULT_STALE_AFTER_DAYS = 31;
const FULL_BPS = 10_000;

const ASSUMPTIONS = [
  "net_worth.valuation_over_ledger",
  "net_worth.liabilities_subtract",
  "net_worth.fx_latest_on_or_before",
  "net_worth.unallocated_to_unassigned",
] as const;

/** Valoración si existe; si no, saldo del libro. En pasivos, la valoración resta. */
function observed(account: AccountInput): Pick<AccountLine, "basis" | "asOf" | "original"> | null {
  if (account.valuation) {
    const { amount, asOf } = account.valuation;
    return { basis: "valuation", asOf, original: account.isLiability ? negate(amount) : amount };
  }
  if (account.ledger) {
    return { basis: "ledger", asOf: account.ledger.asOf, original: account.ledger.amount };
  }
  return null;
}

/**
 * Patrimonio neto en la moneda base, total y por bolsillo, con su explicación.
 *
 * Una cuenta sin valor o sin tipo de cambio no se suma: aparece en `quality.excluded` y el
 * resultado se marca como parcial, en lugar de fallar entero. Lo que no está repartido (o no
 * se puede repartir) va a `unassigned`, de modo que bolsillos + sin asignar = total siempre.
 */
export function netWorth(input: NetWorthInput): NetWorthResult {
  const { baseCurrency, onDate, staleAfterDays = DEFAULT_STALE_AFTER_DAYS } = input;
  const lines: AccountLine[] = [];
  const excluded: ({ accountId: string } & DomainError)[] = [];
  const unallocated: ({ accountId: string } & DomainError)[] = [];

  for (const account of input.accounts) {
    const value = observed(account);
    if (!value) {
      excluded.push({ accountId: account.accountId, code: "net_worth.no_value" });
      continue;
    }
    const converted = convert(value.original, baseCurrency, input.fxRates, onDate);
    if (!converted.ok) {
      excluded.push({ accountId: account.accountId, ...converted.error });
      continue;
    }
    const ageDays = daysBetween(value.asOf, onDate);
    lines.push({
      accountId: account.accountId,
      ...value,
      contribution: converted.value.value,
      fx: converted.value.explanation,
      ageDays,
      stale: ageDays > staleAfterDays,
    });
  }

  let assets = zero(baseCurrency);
  let liabilities = zero(baseCurrency);
  let unassigned = zero(baseCurrency);
  const pockets = new Map<string, Money>();

  for (const line of lines) {
    if (line.contribution.minor >= 0n) assets = add(assets, line.contribution);
    else liabilities = add(liabilities, negate(line.contribution));

    const own = input.allocations.filter((a) => a.accountId === line.accountId);
    if (own.some((a) => a.assetId !== null)) {
      unallocated.push({
        accountId: line.accountId,
        code: "net_worth.position_allocation_unsupported",
      });
      unassigned = add(unassigned, line.contribution);
      continue;
    }
    const valid = own.every((a) => Number.isInteger(a.weightBps) && a.weightBps >= 0);
    const weights = valid ? own.map((a) => BigInt(a.weightBps)) : [];
    const used = weights.reduce((acc, w) => acc + w, 0n);
    if (!valid || used > BigInt(FULL_BPS)) {
      unallocated.push({ accountId: line.accountId, code: "net_worth.invalid_allocation" });
      unassigned = add(unassigned, line.contribution);
      continue;
    }
    const shares = allocate(line.contribution, [...weights, BigInt(FULL_BPS) - used]);
    own.forEach((a, i) => {
      const share = shares[i] as Money;
      pockets.set(a.pocketId, add(pockets.get(a.pocketId) ?? zero(baseCurrency), share));
    });
    unassigned = add(unassigned, shares[own.length] as Money);
  }

  const total = money(assets.minor - liabilities.minor, baseCurrency);
  return {
    value: {
      total,
      assets,
      liabilities,
      byPocket: [...pockets].map(([pocketId, value]) => ({ pocketId, value })),
      unassigned,
    },
    explanation: {
      method: "net_worth.sum_of_accounts",
      onDate,
      baseCurrency,
      assumptions: ASSUMPTIONS,
      accounts: lines,
      quality: {
        level: excluded.length === 0 && unallocated.length === 0 ? "complete" : "partial",
        excluded,
        unallocated,
      },
    },
  };
}

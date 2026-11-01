import {
  calendarDate,
  evaluateAdvice,
  money,
  netWorth,
  thresholdsFrom,
  type AdviceThresholds,
  type Finding,
  type NetWorthResult,
} from "@mymoney/finance-core";
import type { z } from "zod";
import {
  buildHomeModel,
  type AccountMeta,
  type NoticeRow,
  type SpaceRow,
  type accountRow,
  type allocationRow,
  type balanceRow,
  type expenseAssumptionRow,
  type externalFlowRow,
  type fxRow,
  type institutionRow,
  type movementsAfterRow,
  type noticeRow,
  type plannedPendingRow,
  type pocketRow,
  type thresholdRow,
  type valuationRow,
} from "@/server/home-model";
import { buildNetWorthHistory, type HistoryPoint } from "@/server/history-model";
import { buildReturns, type ReturnsModel } from "@/server/returns-model";

/** Todo lo que necesita el inicio, calculado. Lo comparten la web real y la demo. */
export interface HomeData {
  readonly space: SpaceRow;
  readonly today: string;
  readonly result: NetWorthResult;
  readonly accounts: ReadonlyMap<string, AccountMeta>;
  readonly pockets: ReadonlyMap<string, string>;
  readonly institutions: ReadonlyMap<string, string>;
  readonly returns: ReturnsModel;
  readonly findings: readonly Finding[];
  /** Gasto mensual indicado por la persona (supuesto), si lo hay. */
  readonly monthlyExpense: ReturnType<typeof money> | null;
  readonly notices: readonly NoticeRow[];
  /** Umbrales de los avisos: los de la persona (supuestos) o los valores por defecto. */
  readonly thresholds: AdviceThresholds;
  /** Patrimonio a final de cada uno de los últimos meses, según tus valoraciones. */
  readonly history: readonly HistoryPoint[];
}

type Rows<T extends z.ZodType> = readonly z.infer<T>[];

/** Filas ya validadas, venga de la base de datos o de datos de ejemplo. */
export interface HomeInputs {
  readonly space: SpaceRow;
  readonly today: string;
  readonly accounts: Rows<typeof accountRow>;
  readonly balances: Rows<typeof balanceRow>;
  readonly valuations: Rows<typeof valuationRow>;
  readonly movementsAfter: Rows<typeof movementsAfterRow>;
  readonly flows: Rows<typeof externalFlowRow>;
  readonly fxRates: Rows<typeof fxRow>;
  readonly allocations: Rows<typeof allocationRow>;
  readonly pockets: Rows<typeof pocketRow>;
  readonly institutions: Rows<typeof institutionRow>;
  readonly notices: Rows<typeof noticeRow>;
  readonly expense: Rows<typeof expenseAssumptionRow>;
  readonly planned: Rows<typeof plannedPendingRow>;
  readonly thresholds: Rows<typeof thresholdRow>;
}

/** Calcula el inicio a partir de las filas: patrimonio, avisos, rentabilidad y evolución. */
export function assembleHome(inputs: HomeInputs): HomeData {
  const { space, today } = inputs;
  const model = buildHomeModel(
    {
      space,
      accounts: inputs.accounts,
      balances: inputs.balances,
      valuations: inputs.valuations,
      movementsAfter: inputs.movementsAfter,
      fxRates: inputs.fxRates,
      allocations: inputs.allocations,
    },
    calendarDate(today),
  );

  const result = netWorth(model.input);
  const expenseRow = inputs.expense[0];
  const monthlyExpense = expenseRow
    ? money(BigInt(expenseRow.value.split(".")[0] ?? "0"), expenseRow.currency)
    : null;
  const pocketValues = new Map(result.value.byPocket.map((p) => [p.pocketId, p.value]));
  // El valor vigente de cada umbral es el de fecha más reciente (la consulta ya viene ordenada).
  const thresholds = thresholdsFrom(
    inputs.thresholds.map((r) => ({ key: r.key, value: r.value })),
  ).thresholds;
  const findings = evaluateAdvice({
    baseCurrency: space.base_currency,
    accounts: result.explanation.accounts.flatMap((line) => {
      const meta = model.accounts.get(line.accountId);
      return meta
        ? [
            {
              accountId: line.accountId,
              institutionId: meta.institutionId,
              kind: meta.kind,
              value: line.contribution,
              ageDays: line.ageDays,
              stale: line.stale,
            },
          ]
        : [];
    }),
    monthlyExpense,
    thresholds,
    pockets: inputs.pockets.flatMap((p) => {
      const value = pocketValues.get(p.id);
      return value ? [{ pocketId: p.id, riskLevel: p.risk_level, value }] : [];
    }),
    schedule: {
      onDate: calendarDate(today),
      pending: inputs.planned.map((r) => r.planned_on),
    },
  });
  return {
    space,
    today,
    result,
    findings,
    thresholds,
    monthlyExpense,
    returns: buildReturns(
      inputs.flows,
      result.explanation.accounts,
      new Map(
        inputs.accounts.map((a) => [a.id, { currency: a.currency, isLiability: a.is_liability }]),
      ),
      space.base_currency,
      calendarDate(today),
    ),
    accounts: model.accounts,
    pockets: new Map(inputs.pockets.map((p) => [p.id, p.name])),
    institutions: new Map(inputs.institutions.map((i) => [i.id, i.name])),
    notices: inputs.notices,
    history: buildNetWorthHistory(
      {
        space,
        accounts: inputs.accounts,
        valuations: inputs.valuations,
        fxRates: inputs.fxRates,
      },
      calendarDate(today),
    ),
  };
}

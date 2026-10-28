import "server-only";
import {
  calendarDate,
  pensionRoom,
  transferVsSale,
  type CalendarDate,
  type DomainError,
  type PensionRoomResult,
  type Result,
  type TransferVsSaleResult,
} from "@mymoney/finance-core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { externalFlowRow, type SpaceRow } from "@/server/home-model";
import { loadHome } from "@/server/queries/home";
import {
  contributedInYear,
  netContributed,
  parsePercentToBps,
  pensionLimitFrom,
  savingsScaleFrom,
  taxParameterRow,
} from "@/server/tax-model";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface TaxData {
  readonly space: SpaceRow;
  readonly today: CalendarDate;
  readonly fiscalYear: number;
  /** null = falta el parámetro del ejercicio (o no tiene la forma esperada). */
  readonly pension: Result<PensionRoomResult, DomainError> | null;
  readonly hasPensionAccounts: boolean;
  /** Cuentas de fondos que se pueden comparar. */
  readonly funds: readonly { readonly id: string; readonly name: string }[];
  readonly selectedFund: string | null;
  readonly scaleAvailable: boolean;
  /** Resultado de la comparación: null si faltan datos (escala, comisiones o cuenta). */
  readonly comparison: Result<TransferVsSaleResult, DomainError> | null;
  /** Lo que escribió la persona, para devolverlo al formulario. */
  readonly inputs: { readonly currentTer: string; readonly targetTer: string };
}

/** Datos de la pantalla de fiscalidad informativa. */
export async function loadTax(
  supabase: Supabase,
  spaceId: string,
  query: { cuenta?: string | undefined; actual?: string | undefined; destino?: string | undefined },
): Promise<TaxData | null> {
  const home = await loadHome(supabase, spaceId);
  if (!home) return null;
  const today = calendarDate(home.today);
  const fiscalYear = Number(today.slice(0, 4));
  const base = home.space.base_currency;

  const [params, flows] = await Promise.all([
    supabase
      .from("tax_parameters")
      .select("key,fiscal_year,value,source_url,verified_on")
      .eq("country", "ES")
      .eq("fiscal_year", fiscalYear)
      .in("key", ["pension_individual_limit", "savings_brackets"]),
    supabase.rpc("account_external_flows", { p_space_id: spaceId, p_on: today }),
  ]);
  if (params.error || flows.error) {
    logger.warn("db.tax_data_unavailable", {
      code: (params.error ?? flows.error)?.code ?? "unknown",
    });
    throw new Error("No se pudieron cargar los datos fiscales");
  }
  const paramRows = z.array(taxParameterRow).parse(params.data);
  const flowRows = z.array(externalFlowRow).parse(flows.data);

  const pensionAccounts = new Set(
    [...home.accounts.entries()].filter(([, a]) => a.kind === "pension_plan").map(([id]) => id),
  );
  const limit = pensionLimitFrom(paramRows);
  const pension =
    limit && limit.limit.currency === base
      ? pensionRoom({
          limit: limit.limit,
          contributed: contributedInYear(flowRows, pensionAccounts, today, base),
          source: limit.source,
        })
      : null;

  const funds = [...home.accounts.entries()]
    .filter(([, a]) => a.kind === "fund_holding")
    .map(([id, a]) => ({ id, name: a.name }));
  const selectedFund = funds.find((f) => f.id === query.cuenta)?.id ?? funds[0]?.id ?? null;
  const scale = savingsScaleFrom(paramRows);
  const line = home.result.explanation.accounts.find((l) => l.accountId === selectedFund);
  const currentTer = parsePercentToBps(query.actual);
  const targetTer = parsePercentToBps(query.destino);

  let comparison: TaxData["comparison"] = null;
  if (
    scale &&
    line &&
    currentTer !== null &&
    targetTer !== null &&
    scale.currency === line.original.currency
  ) {
    comparison = transferVsSale({
      value: line.original,
      costBasis: netContributed(flowRows, line.accountId, line.original.currency),
      brackets: scale.brackets,
      source: scale.source,
      currentTerBps: currentTer,
      targetTerBps: targetTer,
    });
  }
  return {
    space: home.space,
    today,
    fiscalYear,
    pension,
    hasPensionAccounts: pensionAccounts.size > 0,
    funds,
    selectedFund,
    scaleAvailable: scale !== null,
    comparison,
    inputs: { currentTer: query.actual ?? "", targetTer: query.destino ?? "" },
  };
}

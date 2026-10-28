import "server-only";
import {
  calendarDate,
  type AccountLine,
  type BenchmarkResult,
  type CalendarDate,
  type DomainError,
  type Result,
} from "@mymoney/finance-core";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { buildBenchmark } from "@/server/benchmark-model";
import { externalFlowRow, priceRow, type SpaceRow } from "@/server/home-model";
import { loadHome } from "@/server/queries/home";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface BenchmarkData {
  readonly space: SpaceRow;
  readonly today: CalendarDate;
  /** Cuentas con aportaciones que se pueden comparar. */
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
  /** Instrumentos con precios guardados (datos públicos de mercado). */
  readonly instruments: readonly string[];
  readonly selectedAccount: string | null;
  readonly selectedInstrument: string | null;
  readonly result: Result<BenchmarkResult, DomainError> | null;
}

const MAX_PRICE_ROWS = 5000;

/** Datos de la pantalla de comparación con una referencia. */
export async function loadBenchmark(
  supabase: Supabase,
  spaceId: string,
  accountParam: string | undefined,
  instrumentParam: string | undefined,
): Promise<BenchmarkData | null> {
  const home = await loadHome(supabase, spaceId);
  if (!home) return null;
  const today = calendarDate(home.today);

  const [flows, recent] = await Promise.all([
    supabase.rpc("account_external_flows", { p_space_id: spaceId, p_on: today }),
    supabase
      .from("prices")
      .select("instrument,as_of,price,currency")
      .lte("as_of", today)
      .order("as_of", { ascending: false })
      .limit(MAX_PRICE_ROWS),
  ]);
  if (flows.error) {
    logger.warn("db.external_flows_unavailable", { code: flows.error.code });
    throw new Error("No se pudieron cargar las aportaciones");
  }
  if (recent.error) {
    logger.warn("db.prices_unavailable", { code: recent.error.code });
    throw new Error("No se pudieron cargar los precios");
  }
  const flowRows = z.array(externalFlowRow).parse(flows.data);
  const priceRows = z.array(priceRow).parse(recent.data);

  const withFlows = new Set(flowRows.map((r) => r.account_id));
  const lines = home.result.explanation.accounts.filter((l) => withFlows.has(l.accountId));
  const accounts = lines.flatMap((l) => {
    const meta = home.accounts.get(l.accountId);
    return meta ? [{ id: l.accountId, name: meta.name }] : [];
  });
  const instruments = [...new Set(priceRows.map((p) => p.instrument))].sort();

  const selectedAccount =
    accounts.find((a) => a.id === accountParam)?.id ?? accounts[0]?.id ?? null;
  const selectedInstrument =
    instruments.find((i) => i === instrumentParam) ?? instruments[0] ?? null;

  let result: BenchmarkData["result"] = null;
  const line: AccountLine | undefined = lines.find((l) => l.accountId === selectedAccount);
  if (line && selectedInstrument) {
    result = buildBenchmark(
      flowRows,
      line,
      priceRows.filter((p) => p.instrument === selectedInstrument),
      today,
    );
  }
  return {
    space: home.space,
    today,
    accounts,
    instruments,
    selectedAccount,
    selectedInstrument,
    result,
  };
}

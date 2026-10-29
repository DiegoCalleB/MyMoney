import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { loadHome, type HomeData } from "@/server/queries/home";
import {
  buildRisk,
  cashflowRow,
  compositionRow,
  spendingWindow,
  type RiskModel,
} from "@/server/risk-model";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function check<T>(label: string, error: { code?: string } | null, data: T): T {
  if (error) {
    // Solo el código: el mensaje de la base de datos podría contener datos.
    logger.error("db.query_failed", { code: `${label}:${error.code ?? "unknown"}` });
    throw new Error(`No se pudo cargar ${label}`);
  }
  return data;
}

export interface RiskData {
  readonly home: HomeData;
  readonly model: RiskModel;
  readonly compositions: readonly z.infer<typeof compositionRow>[];
}

/** Repartos manuales de las cuentas del hogar. */
export async function loadCompositions(
  supabase: Supabase,
  spaceId: string,
): Promise<z.infer<typeof compositionRow>[]> {
  const { data, error } = await supabase
    .from("account_compositions")
    .select("account_id,asset_class,weight_bps")
    .eq("space_id", spaceId);
  return z.array(compositionRow).parse(check("repartos por clase", error, data ?? []));
}

/** Todo lo que necesita la pantalla de riesgo: el patrimonio de inicio más repartos y gasto medio. */
export async function loadRisk(supabase: Supabase, spaceId: string): Promise<RiskData | null> {
  const home = await loadHome(supabase, spaceId);
  if (!home) return null;
  const window = spendingWindow(home.today as Parameters<typeof spendingWindow>[0]);
  const [compositions, flow] = await Promise.all([
    loadCompositions(supabase, spaceId),
    supabase.rpc("monthly_cashflow", { p_space_id: spaceId, p_from: window.from, p_to: window.to }),
  ]);
  const cashflow = z.array(cashflowRow).parse(check("gasto mensual", flow.error, flow.data ?? []));
  const model = buildRisk({
    netWorth: home.result,
    accounts: home.accounts,
    compositions,
    cashflow,
  });
  return { home, model, compositions };
}

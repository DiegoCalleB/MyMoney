import "server-only";
import type { CalendarDate } from "@mymoney/finance-core";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { externalFlowRow, valuationRow, type SpaceRow } from "@/server/home-model";
import { buildPerformance, type PeriodKey } from "@/server/performance-model";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Datos de la pantalla de evolución: histórico de valoraciones y aportaciones del hogar. */
export async function loadPerformance(
  supabase: Supabase,
  spaceId: string,
  account: string | undefined,
  period: PeriodKey,
): Promise<{
  space: SpaceRow;
  today: CalendarDate;
  model: ReturnType<typeof buildPerformance>;
} | null> {
  const space = await loadSpace(supabase, spaceId);
  if (!space) return null;
  const today = calendarDateInZone(new Date(), space.timezone);
  const [accounts, valuations, flows] = await Promise.all([
    loadAccountOptions(supabase, spaceId, today),
    supabase
      .from("valuations")
      .select("account_id,as_of,value_minor,currency")
      .eq("space_id", spaceId)
      .is("asset_id", null)
      .lte("as_of", today)
      .order("as_of", { ascending: true })
      .limit(10000),
    supabase.rpc("account_external_flows", { p_space_id: spaceId, p_on: today }),
  ]);
  if (valuations.error) {
    logger.error("db.query_failed", { code: `valoraciones:${valuations.error.code}` });
    throw new Error("No se pudo cargar valoraciones");
  }
  if (flows.error) logger.warn("db.external_flows_unavailable", { code: flows.error.code });
  const model = buildPerformance(
    accounts
      .filter((a) => !a.is_liability)
      .map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
    z.array(valuationRow).parse(valuations.data),
    z.array(externalFlowRow).parse(flows.error ? [] : (flows.data ?? [])),
    space.base_currency,
    account,
    period,
    today,
  );
  return { space, today, model };
}

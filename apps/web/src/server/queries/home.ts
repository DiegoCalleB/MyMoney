import "server-only";
import { THRESHOLD_ASSUMPTION_KEYS, addDays } from "@mymoney/finance-core";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import {
  accountRow,
  allocationRow,
  balanceRow,
  foreignCurrencies,
  fxRow,
  institutionRow,
  expenseAssumptionRow,
  externalFlowRow,
  movementsAfterRow,
  noticeRow,
  plannedPendingRow,
  thresholdRow,
  pocketRow,
  spaceRow,
  valuationRow,
  type SpaceRow,
} from "@/server/home-model";
import { assembleHome, type HomeData } from "@/server/home-assemble";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Cuántos días atrás se buscan tipos de cambio; más antiguos se tratan como no disponibles. */
const FX_WINDOW_DAYS = 45;

export type { HomeData };

function check<T>(label: string, error: { code?: string } | null, data: T): T {
  if (error) {
    // Solo el código: el mensaje de la base de datos podría contener datos.
    logger.error("db.query_failed", { code: `${label}:${error.code ?? "unknown"}` });
    throw new Error(`No se pudo cargar ${label}`);
  }
  return data;
}

/** Listado de hogares de la persona; RLS limita las filas a los suyos. */
export async function loadSpaces(supabase: Supabase): Promise<SpaceRow[]> {
  const { data, error } = await supabase
    .from("spaces")
    .select("id,name,base_currency,timezone")
    .order("created_at", { ascending: true });
  return z.array(spaceRow).parse(check("hogares", error, data ?? []));
}

/** Un hogar concreto, o `null` si no existe o no es de la persona (RLS no distingue ambos casos). */
export async function loadSpace(supabase: Supabase, spaceId: string): Promise<SpaceRow | null> {
  const { data, error } = await supabase
    .from("spaces")
    .select("id,name,base_currency,timezone")
    .eq("id", spaceId)
    .maybeSingle();
  const row = check("hogar", error, data);
  return row ? spaceRow.parse(row) : null;
}

/** Todo lo que necesita la pantalla de inicio de un hogar. */
export async function loadHome(supabase: Supabase, spaceId: string): Promise<HomeData | null> {
  const space = await loadSpace(supabase, spaceId);
  if (!space) return null;
  const today = calendarDateInZone(new Date(), space.timezone);

  const [
    accounts,
    balances,
    valuations,
    allocations,
    pockets,
    notices,
    movements,
    institutions,
    flows,
    expense,
    planned,
    thresholdRows,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,kind,is_liability,currency,scope,closed_on,institution_id,share_bps")
      .eq("space_id", spaceId)
      .is("archived_at", null),
    supabase.rpc("account_cash_balances", { p_space_id: spaceId, p_on: today }),
    supabase
      .from("valuations")
      .select("account_id,as_of,value_minor,currency")
      .eq("space_id", spaceId)
      .is("asset_id", null)
      .lte("as_of", today)
      .order("as_of", { ascending: false })
      .limit(2000),
    supabase.rpc("pocket_allocations_on", { p_space_id: spaceId, p_on: today }),
    supabase
      .from("pockets")
      .select("id,name,risk_level")
      .eq("space_id", spaceId)
      .is("archived_at", null),
    supabase
      .from("recommendations")
      .select("id,message_key,message_params,severity")
      .eq("space_id", spaceId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.rpc("account_movements_after_valuation", { p_space_id: spaceId, p_on: today }),
    supabase.from("institutions").select("id,name").eq("space_id", spaceId),
    supabase.rpc("account_external_flows", { p_space_id: spaceId, p_on: today }),
    supabase
      .from("assumptions")
      .select("value,currency")
      .eq("space_id", spaceId)
      .eq("key", "monthly_expense")
      .is("person_id", null)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(1),
    supabase
      .from("planned_operations")
      .select("planned_on")
      .eq("space_id", spaceId)
      .eq("status", "planned")
      .lt("planned_on", today)
      .limit(200),
    supabase
      .from("assumptions")
      .select("key,value,effective_from")
      .eq("space_id", spaceId)
      .in("key", [...THRESHOLD_ASSUMPTION_KEYS])
      .is("person_id", null)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false })
      .limit(50),
  ]);

  const accountRows = z
    .array(accountRow)
    .parse(check("cuentas", accounts.error, accounts.data ?? []));
  const valuationRows = z
    .array(valuationRow)
    .parse(check("valoraciones", valuations.error, valuations.data ?? []));

  // Si la función aún no está en la base de datos (migración pendiente), se sigue sin ella.
  if (movements.error)
    logger.warn("db.movements_after_unavailable", { code: movements.error.code });
  const movementsAfter = z
    .array(movementsAfterRow)
    .parse(movements.error ? [] : (movements.data ?? []));

  if (flows.error) logger.warn("db.external_flows_unavailable", { code: flows.error.code });
  const flowRows = z.array(externalFlowRow).parse(flows.error ? [] : (flows.data ?? []));

  let fxRows: z.infer<typeof fxRow>[] = [];
  if (foreignCurrencies({ accounts: accountRows, valuations: valuationRows, space }).length > 0) {
    const fx = await supabase
      .from("fx_rates")
      .select("base,quote,as_of,rate,source")
      .gte("as_of", addDays(today, -FX_WINDOW_DAYS))
      .lte("as_of", today)
      .order("as_of", { ascending: false })
      .limit(5000);
    fxRows = z.array(fxRow).parse(check("tipos de cambio", fx.error, fx.data ?? []));
  }

  return assembleHome({
    space,
    today,
    accounts: accountRows,
    balances: z.array(balanceRow).parse(check("saldos", balances.error, balances.data ?? [])),
    valuations: valuationRows,
    movementsAfter,
    flows: flowRows,
    fxRates: fxRows,
    allocations: z
      .array(allocationRow)
      .parse(check("repartos", allocations.error, allocations.data ?? [])),
    pockets: z.array(pocketRow).parse(check("bolsillos", pockets.error, pockets.data ?? [])),
    institutions: z
      .array(institutionRow)
      .parse(check("entidades", institutions.error, institutions.data ?? [])),
    notices: z.array(noticeRow).parse(check("avisos", notices.error, notices.data ?? [])),
    expense: z
      .array(expenseAssumptionRow)
      .parse(check("supuestos", expense.error, expense.data ?? [])),
    planned: z
      .array(plannedPendingRow)
      .parse(check("operaciones planificadas", planned.error, planned.data ?? [])),
    thresholds: z
      .array(thresholdRow)
      .parse(check("umbrales", thresholdRows.error, thresholdRows.data ?? [])),
  });
}

export type AccountOption = z.infer<typeof accountRow>;

/** Cuentas del hogar sobre las que se puede apuntar o valorar: propias, abiertas y no archivadas. */
export async function loadAccountOptions(
  supabase: Supabase,
  spaceId: string,
  today: string,
): Promise<AccountOption[]> {
  const { data, error } = await supabase
    .from("accounts")
    .select("id,name,kind,is_liability,currency,scope,closed_on,institution_id,share_bps")
    .eq("space_id", spaceId)
    .eq("scope", "household")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  return z
    .array(accountRow)
    .parse(check("cuentas", error, data ?? []))
    .filter((a) => a.closed_on === null || a.closed_on > today);
}

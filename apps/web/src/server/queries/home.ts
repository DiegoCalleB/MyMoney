import "server-only";
import { addDays, netWorth, type NetWorthResult } from "@mymoney/finance-core";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import {
  accountRow,
  allocationRow,
  balanceRow,
  buildHomeModel,
  foreignCurrencies,
  fxRow,
  movementsAfterRow,
  noticeRow,
  pocketRow,
  spaceRow,
  valuationRow,
  type AccountMeta,
  type NoticeRow,
  type SpaceRow,
} from "@/server/home-model";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Cuántos días atrás se buscan tipos de cambio; más antiguos se tratan como no disponibles. */
const FX_WINDOW_DAYS = 45;

export interface HomeData {
  readonly space: SpaceRow;
  readonly today: string;
  readonly result: NetWorthResult;
  readonly accounts: ReadonlyMap<string, AccountMeta>;
  readonly pockets: ReadonlyMap<string, string>;
  readonly notices: readonly NoticeRow[];
}

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

  const [accounts, balances, valuations, allocations, pockets, notices, movements] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id,name,kind,is_liability,currency,scope,closed_on")
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
      supabase.from("pockets").select("id,name").eq("space_id", spaceId),
      supabase
        .from("recommendations")
        .select("id,message_key,message_params,severity")
        .eq("space_id", spaceId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase.rpc("account_movements_after_valuation", { p_space_id: spaceId, p_on: today }),
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

  const model = buildHomeModel(
    {
      space,
      accounts: accountRows,
      balances: z.array(balanceRow).parse(check("saldos", balances.error, balances.data ?? [])),
      valuations: valuationRows,
      movementsAfter,
      fxRates: fxRows,
      allocations: z
        .array(allocationRow)
        .parse(check("repartos", allocations.error, allocations.data ?? [])),
    },
    today,
  );

  return {
    space,
    today,
    result: netWorth(model.input),
    accounts: model.accounts,
    pockets: new Map(
      z
        .array(pocketRow)
        .parse(check("bolsillos", pockets.error, pockets.data ?? []))
        .map((p) => [p.id, p.name]),
    ),
    notices: z.array(noticeRow).parse(check("avisos", notices.error, notices.data ?? [])),
  };
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
    .select("id,name,kind,is_liability,currency,scope,closed_on")
    .eq("space_id", spaceId)
    .eq("scope", "household")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  return z
    .array(accountRow)
    .parse(check("cuentas", error, data ?? []))
    .filter((a) => a.closed_on === null || a.closed_on > today);
}

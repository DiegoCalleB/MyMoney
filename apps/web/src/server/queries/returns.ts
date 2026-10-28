import "server-only";
import { type FxRate, dec } from "@mymoney/finance-core";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { loadSpace } from "@/server/queries/home";
import { accountRow, fxRow, valuationRow } from "@/server/home-model";
import { buildReturns, cpiPoints, cpiRow, legRow, type ReturnsModel } from "@/server/returns-model";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Filas por petición: PostgREST corta a 1.000 por defecto y no avisa. */
const PAGE = 1000;
const MAX_PAGES = 50;

function check<T>(label: string, error: { code?: string } | null, data: T): T {
  if (error) {
    // Solo el código: el mensaje de la base de datos podría contener datos.
    logger.error("db.query_failed", { code: `${label}:${error.code ?? "unknown"}` });
    throw new Error(`No se pudo cargar ${label}`);
  }
  return data;
}

export interface ReturnsData {
  readonly spaceName: string;
  readonly today: string;
  readonly model: ReturnsModel;
}

/** Todo lo que necesita la pantalla de rentabilidad de un hogar, o `null` si no existe. */
export async function loadReturns(
  supabase: Supabase,
  spaceId: string,
): Promise<ReturnsData | null> {
  const space = await loadSpace(supabase, spaceId);
  if (!space) return null;
  const today = calendarDateInZone(new Date(), space.timezone);

  const [accounts, valuations, cpi] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,kind,is_liability,currency,scope,closed_on,institution_id")
      .eq("space_id", spaceId)
      .is("archived_at", null),
    supabase
      .from("valuations")
      .select("account_id,as_of,value_minor,currency")
      .eq("space_id", spaceId)
      .is("asset_id", null)
      .lte("as_of", today)
      .order("as_of", { ascending: true })
      .limit(5000),
    supabase
      .from("inflation_index")
      .select("period,index_value")
      .eq("country", "ES")
      .order("period", { ascending: true })
      .limit(1200),
  ]);

  const legRows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await supabase
      .rpc("return_legs", { p_space_id: spaceId, p_to: today })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    const rows = z
      .array(z.unknown())
      .parse(check("movimientos", response.error, response.data ?? []));
    legRows.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Tipos de cambio de todo el periodo: las aportaciones y valoraciones se convierten a su fecha.
  const fx = await supabase
    .from("fx_rates")
    .select("base,quote,as_of,rate,source")
    .lte("as_of", today)
    .order("as_of", { ascending: false })
    .limit(10000);
  const fxRates: FxRate[] = z
    .array(fxRow)
    .parse(check("tipos de cambio", fx.error, fx.data ?? []))
    .map((r) => ({
      base: r.base,
      quote: r.quote,
      asOf: r.as_of,
      rate: dec(r.rate),
      source: r.source,
    }));

  const model = buildReturns(
    {
      space,
      accounts: z.array(accountRow).parse(check("cuentas", accounts.error, accounts.data ?? [])),
      valuations: z
        .array(valuationRow)
        .parse(check("valoraciones", valuations.error, valuations.data ?? [])),
      legs: z.array(legRow).parse(legRows),
      fxRates,
      cpi: cpiPoints(z.array(cpiRow).parse(check("IPC", cpi.error, cpi.data ?? []))),
    },
    today,
  );
  return { spaceName: space.name, today, model };
}

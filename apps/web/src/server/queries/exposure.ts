import "server-only";
import { calendarDate, type CalendarDate } from "@mymoney/finance-core";
import { ACCOUNT_KINDS } from "@mymoney/schemas";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { SpaceRow } from "@/server/home-model";
import {
  buildExposure,
  compositionRow,
  type ExposureDimension,
  type ExposureModel,
} from "@/server/exposure-model";
import { loadHome } from "@/server/queries/home";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const accountAsset = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(ACCOUNT_KINDS),
  primary_asset_id: z.uuid().nullable(),
});

/** Datos de la pantalla de exposición real por una dimensión. */
export async function loadExposure(
  supabase: Supabase,
  spaceId: string,
  dimension: ExposureDimension,
): Promise<{ space: SpaceRow; today: CalendarDate; model: ExposureModel } | null> {
  const home = await loadHome(supabase, spaceId);
  if (!home) return null;
  const today = calendarDate(home.today);

  const accounts = await supabase
    .from("accounts")
    .select("id,name,kind,primary_asset_id")
    .eq("space_id", spaceId)
    .eq("scope", "household")
    .is("archived_at", null);
  if (accounts.error) {
    logger.warn("db.accounts_unavailable", { code: accounts.error.code });
    throw new Error("No se pudieron cargar las cuentas");
  }
  const rows = z.array(accountAsset).parse(accounts.data);
  const assetIds = rows.flatMap((a) => (a.primary_asset_id ? [a.primary_asset_id] : []));

  let compositions: z.infer<typeof compositionRow>[] = [];
  if (assetIds.length > 0) {
    const result = await supabase
      .from("asset_compositions")
      .select("asset_id,as_of,key,weight_bps")
      .eq("space_id", spaceId)
      .eq("dimension", dimension)
      .in("asset_id", assetIds)
      .lte("as_of", today)
      .limit(5000);
    if (result.error) {
      logger.warn("db.compositions_unavailable", { code: result.error.code });
      throw new Error("No se pudieron cargar las composiciones");
    }
    compositions = z.array(compositionRow).parse(result.data);
  }

  const model = buildExposure(
    rows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, primaryAssetId: a.primary_asset_id })),
    home.result.explanation.accounts,
    compositions,
    dimension,
    home.space.base_currency,
    today,
  );
  return { space: home.space, today, model };
}

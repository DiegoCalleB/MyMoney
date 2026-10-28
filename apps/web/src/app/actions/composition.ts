"use server";

import { uuid } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formText, type FormState } from "@/components/form-state";
import { parseComposition } from "@/lib/composition";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { COMPOSITION_KINDS, EXPOSURE_DIMENSIONS } from "@/server/exposure-model";
import { loadSpace } from "@/server/queries/home";

const ROWS = 8;

const input = z.object({
  spaceId: uuid,
  accountId: uuid,
  dimension: z.enum(EXPOSURE_DIMENSIONS, { error: "exposure.form.dimension_invalid" }),
});

const ASSET_KIND = {
  fund_holding: "mutual_fund",
  pension_plan: "pension_fund",
  brokerage: "other",
  crypto: "crypto",
} as const;

const accountRow = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(["fund_holding", "pension_plan", "brokerage", "crypto"]),
  currency: z.string(),
  primary_asset_id: z.uuid().nullable(),
});

/**
 * Declara cómo está repartida una cuenta (por clase de activo, región, divisa o sector). Crea el
 * producto de la cuenta la primera vez (ADR-0023) y guarda la composición con la fecha de hoy y
 * fuente «manual»; si ya había una de hoy para esa dimensión, se sustituye. Lo que falte hasta el
 * 100 % queda «sin clasificar»: nunca se inventa un reparto.
 */
export async function setCompositionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = input.safeParse({
    spaceId: formText(formData, "spaceId"),
    accountId: formText(formData, "accountId"),
    dimension: formText(formData, "dimension"),
  });
  if (!parsed.success) return { error: "exposure.form.failed" };
  const { spaceId, accountId, dimension } = parsed.data;

  const entered = parseComposition(
    Array.from({ length: ROWS }, (_, i) => ({
      key: formText(formData, `key${String(i)}`),
      percent: formText(formData, `percent${String(i)}`),
    })),
  );
  if (!entered.ok) return { error: entered.code };

  const space = await loadSpace(supabase, spaceId);
  if (!space) return { error: "exposure.form.failed" };
  const found = await supabase
    .from("accounts")
    .select("id,name,kind,currency,primary_asset_id")
    .eq("id", accountId)
    .eq("space_id", spaceId)
    .maybeSingle();
  const account = accountRow.safeParse(found.data);
  if (found.error || !account.success || !COMPOSITION_KINDS.has(account.data.kind)) {
    return { error: "exposure.form.failed" };
  }

  let assetId = account.data.primary_asset_id;
  if (assetId === null) {
    const created = await supabase
      .from("assets")
      .insert({
        space_id: spaceId,
        kind: ASSET_KIND[account.data.kind],
        name: account.data.name.slice(0, 120),
        currency: account.data.currency,
        asset_class: "mixed",
      })
      .select("id")
      .single();
    const createdId = z.object({ id: z.uuid() }).safeParse(created.data);
    if (created.error || !createdId.success) {
      logger.warn("composition.asset_failed", { code: created.error?.code ?? "unknown", spaceId });
      return { error: "exposure.form.failed" };
    }
    assetId = createdId.data.id;
    const linked = await supabase
      .from("accounts")
      .update({ primary_asset_id: assetId })
      .eq("id", accountId)
      .eq("space_id", spaceId);
    if (linked.error) {
      logger.warn("composition.link_failed", { code: linked.error.code, spaceId });
      await supabase.from("assets").delete().eq("id", assetId).eq("space_id", spaceId);
      return { error: "exposure.form.failed" };
    }
  }

  const today = calendarDateInZone(new Date(), space.timezone);
  const cleared = await supabase
    .from("asset_compositions")
    .delete()
    .eq("asset_id", assetId)
    .eq("space_id", spaceId)
    .eq("as_of", today)
    .eq("dimension", dimension);
  const inserted = cleared.error
    ? cleared
    : await supabase.from("asset_compositions").insert(
        entered.entries.map((e) => ({
          asset_id: assetId,
          space_id: spaceId,
          as_of: today,
          dimension,
          key: e.key,
          weight_bps: e.weightBps,
          source: "manual",
        })),
      );
  if (inserted.error) {
    logger.warn("composition.save_failed", { code: inserted.error.code, spaceId });
    return { error: "exposure.form.failed" };
  }
  redirect(`/s/${spaceId}/exposicion?dimension=${dimension}`);
}

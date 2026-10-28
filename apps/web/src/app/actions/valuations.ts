"use server";

import { isCalendarDate, isCurrencyCode, parseLocalizedAmount } from "@mymoney/finance-core";
import { updateValuesInput } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";

/**
 * Actualiza el valor de varias cuentas a una fecha. Solo se guardan las que traen importe; el
 * resto no se toca. Si ya había una valoración de esa cuenta en esa fecha, se sustituye.
 */
export async function updateValuesAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = updateValuesInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    asOf: formText(formData, "asOf"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, asOf } = parsed.data;
  if (!isCalendarDate(asOf)) return { fieldErrors: { asOf: "validation.date_invalid" } };

  const space = await loadSpace(supabase, spaceId);
  if (!space) return { error: "values.failed" };
  const today = calendarDateInZone(new Date(), space.timezone);
  if (asOf > today) return { fieldErrors: { asOf: "values.date_future" } };

  const options = await loadAccountOptions(supabase, spaceId, today);
  const fieldErrors: Record<string, string> = {};
  const rows: { accountId: string; currency: string; minor: bigint }[] = [];
  for (const account of options) {
    const text = formText(formData, `value_${account.id}`).trim();
    if (!text) continue;
    const key = `value_${account.id}`;
    if (!isCurrencyCode(account.currency)) continue;
    const amount = parseLocalizedAmount(text, account.currency);
    if (!amount) fieldErrors[key] = "values.field_invalid";
    else if (amount.minor < 0n) fieldErrors[key] = "values.field_negative";
    else rows.push({ accountId: account.id, currency: account.currency, minor: amount.minor });
  }
  if (Object.keys(fieldErrors).length > 0) return { error: "values.invalid", fieldErrors };
  if (rows.length === 0) return { error: "values.nothing" };

  const existing = await supabase
    .from("valuations")
    .select("id,account_id")
    .eq("space_id", spaceId)
    .is("asset_id", null)
    .eq("as_of", asOf)
    .in(
      "account_id",
      rows.map((r) => r.accountId),
    );
  if (existing.error) {
    logger.warn("valuation.lookup_failed", { code: existing.error.code });
    return { error: "values.failed" };
  }
  const existingByAccount = new Map(
    z
      .array(z.object({ id: z.uuid(), account_id: z.uuid() }))
      .parse(existing.data)
      .map((r) => [r.account_id, r.id]),
  );

  let failed = 0;
  for (const row of rows) {
    const id = existingByAccount.get(row.accountId);
    const values = { value_minor: row.minor.toString(), currency: row.currency, source: "manual" };
    const result = id
      ? await supabase.from("valuations").update(values).eq("id", id).eq("space_id", spaceId)
      : await supabase
          .from("valuations")
          .insert({ ...values, space_id: spaceId, account_id: row.accountId, as_of: asOf });
    if (result.error) {
      failed += 1;
      logger.warn("valuation.save_failed", { code: result.error.code });
    }
  }
  if (failed > 0) return { error: failed === rows.length ? "values.failed" : "values.partial" };
  redirect(`/s/${spaceId}/inicio`);
}

"use server";

import { isCurrencyCode, parseLocalizedAmount } from "@mymoney/finance-core";
import { addAccountInput, defaultLiquidity } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { loadSpace } from "@/server/queries/home";

/**
 * Alta rápida: crea la cuenta y registra su valor de hoy como valoración manual. Son dos
 * escrituras; si falla la segunda se retira la cuenta para no dejar una cuenta sin valor.
 */
export async function addAccountAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = addAccountInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    name: formText(formData, "name"),
    kind: formText(formData, "kind"),
    currency: formText(formData, "currency"),
    currentValue: formText(formData, "currentValue"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, name, kind, currency, currentValue } = parsed.data;
  if (!isCurrencyCode(currency))
    return { fieldErrors: { currency: "validation.currency_invalid" } };

  const amount = parseLocalizedAmount(currentValue, currency);
  if (!amount) return { fieldErrors: { currentValue: "account.value_invalid" } };
  if (amount.minor < 0n) return { fieldErrors: { currentValue: "account.value_negative" } };

  const space = await loadSpace(supabase, spaceId);
  if (!space) return { error: "account.new.failed" };

  const created = await supabase
    .from("accounts")
    .insert({ space_id: spaceId, name, kind, currency, liquidity: defaultLiquidity(kind) })
    .select("id")
    .single();
  if (created.error) {
    logger.warn("account.create_failed", { code: created.error.code });
    return { error: "account.new.failed" };
  }

  const valuation = await supabase.from("valuations").insert({
    space_id: spaceId,
    account_id: created.data.id,
    as_of: calendarDateInZone(new Date(), space.timezone),
    value_minor: amount.minor.toString(),
    currency,
    source: "manual",
  });
  if (valuation.error) {
    logger.warn("account.valuation_failed", { code: valuation.error.code });
    await supabase.from("accounts").delete().eq("id", created.data.id).eq("space_id", spaceId);
    return { error: "account.new.failed" };
  }
  redirect(`/s/${spaceId}/inicio`);
}

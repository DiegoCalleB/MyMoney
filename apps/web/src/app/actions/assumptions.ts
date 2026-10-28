"use server";

import { isCurrencyCode, parseLocalizedAmount } from "@mymoney/finance-core";
import { amountText, uuid } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { loadSpace } from "@/server/queries/home";

const input = z.object({ spaceId: uuid, monthlyExpense: amountText });

/**
 * Guarda el gasto mensual aproximado como supuesto (`assumptions`, clave `monthly_expense`),
 * con fecha de hoy: si ya había uno de hoy se sustituye; los anteriores quedan como historial.
 */
export async function setMonthlyExpenseAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = input.safeParse({
    spaceId: formText(formData, "spaceId"),
    monthlyExpense: formText(formData, "monthlyExpense"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, monthlyExpense } = parsed.data;

  const space = await loadSpace(supabase, spaceId);
  if (!space || !isCurrencyCode(space.base_currency)) return { error: "assumptions.failed" };
  const amount = parseLocalizedAmount(monthlyExpense, space.base_currency);
  if (!amount) return { fieldErrors: { monthlyExpense: "assumptions.expense_invalid" } };
  if (amount.minor <= 0n)
    return { fieldErrors: { monthlyExpense: "assumptions.expense_not_positive" } };

  const today = calendarDateInZone(new Date(), space.timezone);
  const row = {
    value: amount.minor.toString(),
    unit: "currency_minor",
    currency: space.base_currency,
  };
  const existing = await supabase
    .from("assumptions")
    .select("id")
    .eq("space_id", spaceId)
    .eq("key", "monthly_expense")
    .is("person_id", null)
    .eq("effective_from", today)
    .maybeSingle();
  const existingId = z.object({ id: z.uuid() }).safeParse(existing.data);
  const saved = existingId.success
    ? await supabase
        .from("assumptions")
        .update(row)
        .eq("id", existingId.data.id)
        .eq("space_id", spaceId)
    : await supabase
        .from("assumptions")
        .insert({ ...row, space_id: spaceId, key: "monthly_expense", effective_from: today });
  if (saved.error) {
    logger.warn("assumption.save_failed", { code: saved.error.code });
    return { error: "assumptions.failed" };
  }
  redirect(`/s/${spaceId}/inicio`);
}

"use server";

import {
  THRESHOLD_FIELDS,
  isCurrencyCode,
  parseLocalizedAmount,
  type AdviceThresholds,
} from "@mymoney/finance-core";
import { amountText, uuid } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { parseShareToBps, parseWholeMonths } from "@/lib/percent";
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

const thresholdsInput = z.object({ spaceId: uuid });

/** Campo del formulario → umbral y cómo se lee. */
const THRESHOLD_FORM = [
  { field: "speculative", name: "speculativeShareBps", read: parseShareToBps },
  { field: "institution", name: "institutionShareBps", read: parseShareToBps },
  { field: "liquid", name: "liquidShareBps", read: parseShareToBps },
  { field: "runwayMin", name: "runwayMinMonths", read: parseWholeMonths },
  { field: "runwayMax", name: "runwayMaxMonths", read: parseWholeMonths },
] as const satisfies readonly {
  field: string;
  name: keyof AdviceThresholds;
  read: (text: string | undefined) => number | null;
}[];

/**
 * Guarda los umbrales de los avisos como supuestos (`assumptions`), con la fecha de hoy. Todos son
 * obligatorios en el formulario para que la persona vea y confirme los valores con los que se
 * calculan sus avisos; se validan los rangos y que el mínimo de meses sea menor que el máximo.
 */
export async function setThresholdsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = thresholdsInput.safeParse({ spaceId: formText(formData, "spaceId") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId } = parsed.data;

  const values = {} as Record<keyof AdviceThresholds, number>;
  const fieldErrors: Record<string, string> = {};
  for (const entry of THRESHOLD_FORM) {
    const value = entry.read(formText(formData, entry.field));
    const range = THRESHOLD_FIELDS[entry.name];
    if (value === null || value < range.min || value > range.max) {
      fieldErrors[entry.field] = "thresholds.invalid";
    } else {
      values[entry.name] = value;
    }
  }
  if (Object.keys(fieldErrors).length === 0 && values.runwayMinMonths >= values.runwayMaxMonths) {
    fieldErrors.runwayMin = "thresholds.runway_order";
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const space = await loadSpace(supabase, spaceId);
  if (!space) return { error: "assumptions.failed" };
  const today = calendarDateInZone(new Date(), space.timezone);
  let failed = 0;
  for (const entry of THRESHOLD_FORM) {
    const range = THRESHOLD_FIELDS[entry.name];
    const row = { value: String(values[entry.name]), unit: range.unit };
    const existing = await supabase
      .from("assumptions")
      .select("id")
      .eq("space_id", spaceId)
      .eq("key", range.assumptionKey)
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
      : await supabase.from("assumptions").insert({
          ...row,
          space_id: spaceId,
          key: range.assumptionKey,
          effective_from: today,
        });
    if (saved.error) {
      failed += 1;
      logger.warn("assumption.save_failed", { code: saved.error.code });
    }
  }
  if (failed > 0) return { error: "assumptions.failed" };
  redirect(`/s/${spaceId}/inicio`);
}

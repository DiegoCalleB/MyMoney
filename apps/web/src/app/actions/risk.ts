"use server";

import { parsePercentBps } from "@mymoney/finance-core";
import { COMPOSITION_CLASSES, setCompositionInput } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";

/**
 * Guarda el reparto de una cuenta por clase de activo. Cada campo es un porcentaje; lo que falte
 * hasta 100 queda «sin clasificar». Todo en blanco borra el reparto y la cuenta vuelve a la clase
 * por defecto de su tipo.
 */
export async function setCompositionAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = setCompositionInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    accountId: formText(formData, "accountId"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, accountId } = parsed.data;

  const fieldErrors: Record<string, string> = {};
  const weights: Record<string, number> = {};
  let total = 0;
  for (const asset of COMPOSITION_CLASSES) {
    const text = formText(formData, `w_${asset}`).trim();
    if (!text) continue;
    const bps = parsePercentBps(text);
    if (bps === null) {
      fieldErrors[`w_${asset}`] = "risk.field_invalid";
    } else if (bps > 0) {
      weights[asset] = bps;
      total += bps;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { error: "risk.invalid", fieldErrors };
  if (total > 10_000) return { error: "risk.sum_over" };

  const { error } = await supabase.rpc("set_account_composition", {
    p_space_id: spaceId,
    p_account_id: accountId,
    p_weights: weights,
  });
  if (error) {
    logger.warn("composition.save_failed", { code: error.code });
    return { error: "risk.failed" };
  }
  redirect(`/s/${spaceId}/riesgo`);
}

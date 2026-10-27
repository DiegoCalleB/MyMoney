"use server";

import { createSpaceInput } from "@mymoney/schemas";
import { isCurrencyCode } from "@mymoney/finance-core";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";

export async function createSpaceAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = createSpaceInput.safeParse({
    name: formText(formData, "name"),
    baseCurrency: formText(formData, "baseCurrency") || undefined,
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  if (!isCurrencyCode(parsed.data.baseCurrency)) {
    return { fieldErrors: { baseCurrency: "validation.currency_invalid" } };
  }

  const created = await supabase.rpc("create_space", {
    p_name: parsed.data.name,
    p_base_currency: parsed.data.baseCurrency,
  });
  const newId = z.uuid().safeParse(created.data);
  if (created.error || !newId.success) {
    logger.warn("space.create_failed", { code: created.error?.code ?? "unknown" });
    return { error: "spaces.create.failed" };
  }
  const spaceId = newId.data;

  const seeded = await supabase.rpc("seed_default_categories", { p_space_id: spaceId });
  if (seeded.error) {
    // No bloquea: el hogar ya existe y las categorías se pueden sembrar más tarde.
    logger.warn("space.seed_categories_failed", { code: seeded.error.code });
  }
  redirect(`/s/${spaceId}/inicio`);
}

"use server";

import { uuid } from "@mymoney/schemas";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formText } from "@/components/form-state";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";

const input = z.object({
  spaceId: uuid,
  transactionId: uuid,
  ruleId: z.enum(["possible_duplicate", "recurring_change", "unusual_amount"]),
});

/** Marca un cargo señalado como revisado («ya lo reconozco») para que deje de aparecer. */
export async function markReviewedAction(formData: FormData): Promise<void> {
  const { supabase } = await requireReadyUser();
  const parsed = input.safeParse({
    spaceId: formText(formData, "spaceId"),
    transactionId: formText(formData, "transactionId"),
    ruleId: formText(formData, "ruleId"),
  });
  if (!parsed.success) redirect("/");
  const { spaceId, transactionId, ruleId } = parsed.data;
  const saved = await supabase
    .from("reviewed_movements")
    .upsert(
      { space_id: spaceId, transaction_id: transactionId, rule_id: ruleId },
      { onConflict: "space_id,transaction_id,rule_id", ignoreDuplicates: true },
    );
  if (saved.error) logger.warn("review.mark_failed", { code: saved.error.code });
  revalidatePath(`/s/${spaceId}/revisar`);
  revalidatePath(`/s/${spaceId}/inicio`);
}

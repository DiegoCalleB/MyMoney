"use server";

import { isCalendarDate, isCurrencyCode, parseLocalizedAmount } from "@mymoney/finance-core";
import { addMovementInput } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";

/**
 * Apunta un gasto, un ingreso o un traspaso. El libro solo se escribe por la RPC
 * `create_transaction` (regla 5), que además comprueba permisos y que todo cuadre.
 */
export async function addMovementAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = addMovementInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    kind: formText(formData, "kind"),
    accountId: formText(formData, "accountId"),
    toAccountId: formText(formData, "toAccountId"),
    amount: formText(formData, "amount"),
    occurredOn: formText(formData, "occurredOn"),
    description: formText(formData, "description") || undefined,
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const input = parsed.data;
  if (!isCalendarDate(input.occurredOn))
    return { fieldErrors: { occurredOn: "validation.date_invalid" } };

  const space = await loadSpace(supabase, input.spaceId);
  if (!space) return { error: "movement.failed" };
  const today = calendarDateInZone(new Date(), space.timezone);
  if (input.occurredOn > today) return { fieldErrors: { occurredOn: "movement.date_future" } };

  // Las cuentas se resuelven en el servidor: la moneda sale de la cuenta, nunca del formulario.
  const options = await loadAccountOptions(supabase, input.spaceId, today);
  const from = options.find((a) => a.id === input.accountId);
  if (!from || !isCurrencyCode(from.currency))
    return { fieldErrors: { accountId: "movement.account_invalid" } };
  const amount = parseLocalizedAmount(input.amount, from.currency);
  if (!amount) return { fieldErrors: { amount: "movement.amount_invalid" } };
  if (amount.minor <= 0n) return { fieldErrors: { amount: "movement.amount_not_positive" } };

  const value = amount.minor.toString();
  const negative = (-amount.minor).toString();
  let kind: string;
  let legs: Record<string, string | null>[];
  if (input.kind === "transfer") {
    const to = options.find((a) => a.id === input.toAccountId);
    if (!to) return { fieldErrors: { toAccountId: "movement.account_invalid" } };
    if (to.currency !== from.currency)
      return { fieldErrors: { toAccountId: "movement.currency_mismatch" } };
    kind = "internal_transfer";
    legs = [
      { role: "cash", account_id: from.id, amount_minor: negative, currency: from.currency },
      { role: "cash", account_id: to.id, amount_minor: value, currency: to.currency },
    ];
  } else {
    const sign = input.kind === "expense" ? -1n : 1n;
    kind = input.kind;
    legs = [
      {
        role: "cash",
        account_id: from.id,
        amount_minor: (amount.minor * sign).toString(),
        currency: from.currency,
      },
      {
        role: "external",
        account_id: null,
        amount_minor: (amount.minor * -sign).toString(),
        currency: from.currency,
      },
    ];
  }

  const created = await supabase.rpc("create_transaction", {
    p_space_id: input.spaceId,
    p_kind: kind,
    p_occurred_on: input.occurredOn,
    p_legs: legs,
    ...(input.description ? { p_description: input.description } : {}),
  });
  if (created.error) {
    logger.warn("movement.create_failed", { code: created.error.code });
    return { error: "movement.failed" };
  }
  redirect(`/s/${input.spaceId}/inicio`);
}

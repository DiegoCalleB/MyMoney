"use client";

import { useActionState } from "react";
import { setMonthlyExpenseAction } from "@/app/actions/assumptions";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function AssumptionsForm({
  spaceId,
  currency,
  initial,
}: {
  readonly spaceId: string;
  readonly currency: string;
  readonly initial: string;
}) {
  const [state, action] = useActionState(setMonthlyExpenseAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <Field
        id="monthlyExpense"
        name="monthlyExpense"
        label={t("assumptions.expense.label")}
        hint={t("assumptions.expense.hint", { currency })}
        inputMode="decimal"
        autoComplete="off"
        maxLength={32}
        defaultValue={initial}
        error={state.fieldErrors?.monthlyExpense}
      />
      <SubmitButton>{t("assumptions.submit")}</SubmitButton>
    </form>
  );
}

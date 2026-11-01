"use client";

import { useActionState } from "react";
import { updatePasswordAction } from "@/app/actions/auth";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function ResetForm() {
  const [state, action] = useActionState(updatePasswordAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <Field
        id="password"
        name="password"
        type="password"
        label={t("auth.reset.label")}
        hint={t("auth.password.hint")}
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      <SubmitButton>{t("auth.reset.submit")}</SubmitButton>
    </form>
  );
}

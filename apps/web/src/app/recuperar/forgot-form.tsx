"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "@/app/actions/auth";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordResetAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <Field
        id="email"
        name="email"
        type="email"
        label={t("auth.email.label")}
        autoComplete="email"
        inputMode="email"
        error={state.fieldErrors?.email}
      />
      <SubmitButton>{t("auth.forgot.submit")}</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { signUpAction } from "@/app/actions/auth";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, INITIAL_FORM_STATE);
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
      <Field
        id="password"
        name="password"
        type="password"
        label={t("auth.password.label")}
        hint={t("auth.password.hint")}
        autoComplete="new-password"
        error={state.fieldErrors?.password}
      />
      <SubmitButton>{t("auth.sign_up.submit")}</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/actions/auth";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function SignInForm({ initialError }: { readonly initialError?: string }) {
  const [state, action] = useActionState(signInAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error ?? initialError} />
      <Field
        id="email"
        name="email"
        type="email"
        label={t("auth.email.label")}
        autoComplete="email"
        inputMode="email"
      />
      <Field
        id="password"
        name="password"
        type="password"
        label={t("auth.password.label")}
        autoComplete="current-password"
      />
      <SubmitButton>{t("auth.sign_in.submit")}</SubmitButton>
    </form>
  );
}

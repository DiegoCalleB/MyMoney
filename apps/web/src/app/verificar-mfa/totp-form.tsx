"use client";

import { useActionState } from "react";
import { verifyTotpAction } from "@/app/actions/mfa";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

/** Formulario del código de 6 cifras: sirve para entrar y para terminar la activación. */
export function TotpForm({
  factorId,
  submitLabel,
}: {
  readonly factorId: string;
  readonly submitLabel: string;
}) {
  const [state, action] = useActionState(verifyTotpAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="factorId" value={factorId} />
      <Field
        id="code"
        name="code"
        label={t("mfa.code.label")}
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        pattern="[0-9]{6}"
        error={state.fieldErrors?.code}
      />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { startBankAction } from "@/app/actions/connections";
import { FormAlert, SubmitButton } from "@/components/fields";
import type { FormState } from "@/components/form-state";
import styles from "@/components/fields.module.css";
import { t } from "@/lib/i18n";

export function BankStart({
  spaceId,
  country,
  banks,
}: {
  readonly spaceId: string;
  readonly country: string;
  readonly banks: readonly string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(startBankAction, {});
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="country" value={country} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="bank">
          {t("connections.bank.bank.label")}
        </label>
        <p className={styles.hint} id="bank-hint">
          {t("connections.bank.bank.hint")}
        </p>
        <select
          className={styles.input}
          id="bank"
          name="bank"
          defaultValue={banks[0]}
          aria-describedby={state.fieldErrors?.bank ? "bank-hint bank-error" : "bank-hint"}
          aria-invalid={state.fieldErrors?.bank ? "true" : undefined}
        >
          {banks.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.bank ? (
          <p className={styles.error} id="bank-error">
            {t(state.fieldErrors.bank)}
          </p>
        ) : null}
      </div>
      <SubmitButton>{t("connections.bank.submit")}</SubmitButton>
    </form>
  );
}

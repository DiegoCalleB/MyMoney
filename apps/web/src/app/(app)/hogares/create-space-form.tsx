"use client";

import { MINOR_UNITS } from "@mymoney/finance-core";
import { useActionState } from "react";
import { createSpaceAction } from "@/app/actions/spaces";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function CreateSpaceForm() {
  const [state, action] = useActionState(createSpaceAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <Field
        id="name"
        name="name"
        label={t("spaces.name.label")}
        hint={t("spaces.name.hint")}
        maxLength={80}
        autoComplete="off"
        error={state.fieldErrors?.name}
      />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="baseCurrency">
          {t("spaces.currency.label")}
        </label>
        <select className={styles.input} id="baseCurrency" name="baseCurrency" defaultValue="EUR">
          {Object.keys(MINOR_UNITS).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        {state.fieldErrors?.baseCurrency ? (
          <p className={styles.error}>{t(state.fieldErrors.baseCurrency)}</p>
        ) : null}
      </div>
      <SubmitButton>{t("spaces.create.submit")}</SubmitButton>
    </form>
  );
}

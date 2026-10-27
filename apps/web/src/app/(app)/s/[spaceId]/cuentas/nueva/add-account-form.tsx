"use client";

import { MINOR_UNITS } from "@mymoney/finance-core";
import { ACCOUNT_KINDS } from "@mymoney/schemas";
import { useActionState } from "react";
import { addAccountAction } from "@/app/actions/accounts";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function AddAccountForm({
  spaceId,
  baseCurrency,
}: {
  readonly spaceId: string;
  readonly baseCurrency: string;
}) {
  const [state, action] = useActionState(addAccountAction, INITIAL_FORM_STATE);
  const errors = state.fieldErrors;
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <Field
        id="name"
        name="name"
        label={t("account.name.label")}
        hint={t("account.name.hint")}
        maxLength={80}
        autoComplete="off"
        error={errors?.name}
      />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="kind">
          {t("account.kind.label")}
        </label>
        <select className={styles.input} id="kind" name="kind" defaultValue="current">
          {ACCOUNT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`account.kind.${kind}`)}
            </option>
          ))}
        </select>
        {errors?.kind ? <p className={styles.error}>{t(errors.kind)}</p> : null}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="currency">
          {t("account.currency.label")}
        </label>
        <select className={styles.input} id="currency" name="currency" defaultValue={baseCurrency}>
          {Object.keys(MINOR_UNITS).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        {errors?.currency ? <p className={styles.error}>{t(errors.currency)}</p> : null}
      </div>
      <Field
        id="currentValue"
        name="currentValue"
        label={t("account.value.label")}
        hint={t("account.value.hint")}
        inputMode="decimal"
        autoComplete="off"
        maxLength={32}
        error={errors?.currentValue}
      />
      <SubmitButton>{t("account.new.submit")}</SubmitButton>
    </form>
  );
}

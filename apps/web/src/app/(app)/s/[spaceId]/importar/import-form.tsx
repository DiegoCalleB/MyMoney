"use client";

import { useActionState } from "react";
import { previewImportAction } from "@/app/actions/imports";
import { FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

interface AccountChoice {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
}

export function ImportForm({
  spaceId,
  accounts,
}: {
  readonly spaceId: string;
  readonly accounts: readonly AccountChoice[];
}) {
  const [state, action] = useActionState(previewImportAction, INITIAL_FORM_STATE);
  const errors = state.fieldErrors;
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="accountId">
          {t("import.account.label")}
        </label>
        <select
          className={styles.input}
          id="accountId"
          name="accountId"
          defaultValue={accounts[0]?.id}
          aria-invalid={errors?.accountId ? "true" : undefined}
          aria-describedby={errors?.accountId ? "accountId-error" : undefined}
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </select>
        {errors?.accountId ? (
          <p className={styles.error} id="accountId-error">
            {t(errors.accountId)}
          </p>
        ) : null}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="file">
          {t("import.file.label")}
        </label>
        <p className={styles.hint} id="file-hint">
          {t("import.file.hint")}
        </p>
        <input
          className={styles.input}
          id="file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          aria-invalid={errors?.file ? "true" : undefined}
          aria-describedby={errors?.file ? "file-hint file-error" : "file-hint"}
        />
        {errors?.file ? (
          <p className={styles.error} id="file-error">
            {t(errors.file)}
          </p>
        ) : null}
      </div>
      <SubmitButton>{t("import.submit")}</SubmitButton>
    </form>
  );
}

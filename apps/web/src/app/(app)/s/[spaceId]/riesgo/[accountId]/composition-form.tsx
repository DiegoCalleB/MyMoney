"use client";

import { useActionState } from "react";
import { setCompositionAction } from "@/app/actions/risk";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

interface Row {
  readonly asset: string;
  readonly current: string;
}

export function CompositionForm({
  spaceId,
  accountId,
  rows,
}: {
  readonly spaceId: string;
  readonly accountId: string;
  readonly rows: readonly Row[];
}) {
  const [state, action] = useActionState(setCompositionAction, INITIAL_FORM_STATE);
  const errors = state.fieldErrors;
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="accountId" value={accountId} />
      {rows.map((row) => (
        <Field
          key={row.asset}
          id={`w_${row.asset}`}
          name={`w_${row.asset}`}
          label={`${t(`asset_class.${row.asset}`)} (%)`}
          inputMode="decimal"
          autoComplete="off"
          maxLength={6}
          required={false}
          defaultValue={row.current}
          error={errors?.[`w_${row.asset}`]}
        />
      ))}
      <SubmitButton>{t("risk.edit.submit")}</SubmitButton>
    </form>
  );
}

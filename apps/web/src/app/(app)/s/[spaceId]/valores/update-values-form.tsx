"use client";

import { useActionState } from "react";
import { updateValuesAction } from "@/app/actions/valuations";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly isLiability: boolean;
  readonly current: string;
}

export function UpdateValuesForm({
  spaceId,
  today,
  accounts,
}: {
  readonly spaceId: string;
  readonly today: string;
  readonly accounts: readonly Row[];
}) {
  const [state, action] = useActionState(updateValuesAction, INITIAL_FORM_STATE);
  const errors = state.fieldErrors;
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <Field
        id="asOf"
        name="asOf"
        type="date"
        label={t("values.date.label")}
        defaultValue={today}
        error={errors?.asOf}
      />
      {accounts.map((a) => (
        <Field
          key={a.id}
          id={`value_${a.id}`}
          name={`value_${a.id}`}
          label={`${a.name} (${a.currency})`}
          hint={[
            a.current ? t("values.current", { value: a.current }) : "",
            a.isLiability ? t("values.debt_hint") : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          inputMode="decimal"
          autoComplete="off"
          maxLength={32}
          required={false}
          error={errors?.[`value_${a.id}`]}
        />
      ))}
      <SubmitButton>{t("values.submit")}</SubmitButton>
    </form>
  );
}

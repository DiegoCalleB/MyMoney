"use client";

import { useActionState } from "react";
import { setCompositionAction } from "@/app/actions/composition";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";
import { EXPOSURE_DIMENSIONS, type ExposureDimension } from "@/server/exposure-model";

const ROWS = 8;

export function CompositionForm({
  spaceId,
  accountId,
  initialDimension,
}: {
  readonly spaceId: string;
  readonly accountId: string;
  readonly initialDimension: ExposureDimension;
}) {
  const [state, action] = useActionState(setCompositionAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="accountId" value={accountId} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="dimension">
          {t("exposure.form.dimension")}
        </label>
        <select
          className={styles.input}
          id="dimension"
          name="dimension"
          defaultValue={initialDimension}
        >
          {EXPOSURE_DIMENSIONS.map((d) => (
            <option key={d} value={d}>
              {t(`exposure.dimension.${d}`)}
            </option>
          ))}
        </select>
      </div>
      <p className={styles.hint}>{t("exposure.form.hint")}</p>
      {Array.from({ length: ROWS }, (_, i) => (
        <div key={i} className={styles.field}>
          <Field
            id={`key${String(i)}`}
            name={`key${String(i)}`}
            label={t("exposure.form.key", { n: String(i + 1) })}
            maxLength={80}
            autoComplete="off"
            required={false}
          />
          <Field
            id={`percent${String(i)}`}
            name={`percent${String(i)}`}
            label={t("exposure.form.percent", { n: String(i + 1) })}
            inputMode="decimal"
            maxLength={6}
            autoComplete="off"
            required={false}
          />
        </div>
      ))}
      <SubmitButton>{t("exposure.form.submit")}</SubmitButton>
    </form>
  );
}

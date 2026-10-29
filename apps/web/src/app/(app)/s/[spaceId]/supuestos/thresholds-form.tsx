"use client";

import { useActionState } from "react";
import { setThresholdsAction } from "@/app/actions/assumptions";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

interface Initial {
  readonly speculative: string;
  readonly institution: string;
  readonly liquid: string;
  readonly runwayMin: string;
  readonly runwayMax: string;
}

const FIELDS = [
  {
    name: "speculative",
    label: "thresholds.speculative.label",
    hint: "thresholds.speculative.hint",
  },
  {
    name: "institution",
    label: "thresholds.institution.label",
    hint: "thresholds.institution.hint",
  },
  { name: "liquid", label: "thresholds.liquid.label", hint: "thresholds.liquid.hint" },
  { name: "runwayMin", label: "thresholds.runway_min.label", hint: "thresholds.runway_min.hint" },
  { name: "runwayMax", label: "thresholds.runway_max.label", hint: "thresholds.runway_max.hint" },
] as const;

export function ThresholdsForm({
  spaceId,
  initial,
}: {
  readonly spaceId: string;
  readonly initial: Initial;
}) {
  const [state, action] = useActionState(setThresholdsAction, INITIAL_FORM_STATE);
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      {FIELDS.map((f) => (
        <Field
          key={f.name}
          id={f.name}
          name={f.name}
          label={t(f.label)}
          hint={t(f.hint)}
          inputMode="decimal"
          autoComplete="off"
          maxLength={6}
          defaultValue={initial[f.name]}
          error={state.fieldErrors?.[f.name]}
        />
      ))}
      <SubmitButton>{t("thresholds.submit")}</SubmitButton>
    </form>
  );
}

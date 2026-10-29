"use client";

import { useActionState } from "react";
import { confirmImportAction, discardImportAction } from "@/app/actions/imports";
import { FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

export function ConfirmForm({
  spaceId,
  batchId,
  pending,
}: {
  readonly spaceId: string;
  readonly batchId: string;
  readonly pending: number;
}) {
  const [state, action] = useActionState(confirmImportAction, INITIAL_FORM_STATE);
  return (
    <>
      {pending > 0 ? (
        <form className={styles.form} action={action}>
          <FormAlert error={state.error} />
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="batchId" value={batchId} />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="keepDescriptions">
              <input
                id="keepDescriptions"
                name="keepDescriptions"
                type="checkbox"
                defaultChecked
                aria-describedby="keepDescriptions-hint"
              />{" "}
              {t("import.preview.keep_descriptions")}
            </label>
            <p className={styles.hint} id="keepDescriptions-hint">
              {t("import.preview.keep_descriptions_hint")}
            </p>
          </div>
          <SubmitButton>{t("import.preview.confirm", { count: String(pending) })}</SubmitButton>
        </form>
      ) : (
        <p role="status">{t("import.preview.nothing_new")}</p>
      )}
      <form action={discardImportAction}>
        <input type="hidden" name="spaceId" value={spaceId} />
        <input type="hidden" name="batchId" value={batchId} />
        <button className={styles.submit} type="submit">
          {t("import.preview.discard")}
        </button>
      </form>
    </>
  );
}

"use client";

import { useActionState } from "react";
import { startEnrollAction, type EnrollState } from "@/app/actions/mfa";
import { FormAlert, SubmitButton } from "@/components/fields";
import fields from "@/components/fields.module.css";
import { TotpForm } from "@/app/verificar-mfa/totp-form";
import { CopyButton } from "./copy-button";
import { t } from "@/lib/i18n";
import styles from "../../page.module.css";

const START: EnrollState = {};

export function EnrollFlow() {
  const [state, start] = useActionState(() => startEnrollAction(), START);
  const enroll = state.enroll;
  if (!enroll) {
    return (
      <form className={fields.form} action={start}>
        <FormAlert error={state.error} />
        <SubmitButton>{t("mfa.enroll.start")}</SubmitButton>
      </form>
    );
  }
  return (
    <div className={styles.section}>
      {enroll.uri ? (
        <p>
          <a className={styles.primary} href={enroll.uri}>
            {t("mfa.enroll.open_app")}
          </a>
        </p>
      ) : null}
      <p className={styles.note}>{t("mfa.enroll.open_hint")}</p>
      <p>{t("mfa.enroll.secret")}</p>
      <p>
        <code className={styles.secret}>{enroll.secret}</code>
      </p>
      <p>
        <CopyButton value={enroll.secret} />
      </p>
      <TotpForm factorId={enroll.factorId} submitLabel={t("mfa.enroll.confirm")} />
    </div>
  );
}

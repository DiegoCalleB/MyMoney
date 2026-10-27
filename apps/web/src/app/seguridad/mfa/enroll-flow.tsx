"use client";

import { useActionState } from "react";
import { startEnrollAction, type EnrollState } from "@/app/actions/mfa";
import { FormAlert, SubmitButton } from "@/components/fields";
import fields from "@/components/fields.module.css";
import { TotpForm } from "@/app/verificar-mfa/totp-form";
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
      <p>{t("mfa.enroll.scan")}</p>
      <img className={styles.qr} src={enroll.qr} alt={t("mfa.enroll.qr_alt")} />
      <p>{t("mfa.enroll.secret")}</p>
      <p>
        <code className={styles.secret}>{enroll.secret}</code>
      </p>
      <TotpForm factorId={enroll.factorId} submitLabel={t("mfa.enroll.confirm")} />
    </div>
  );
}

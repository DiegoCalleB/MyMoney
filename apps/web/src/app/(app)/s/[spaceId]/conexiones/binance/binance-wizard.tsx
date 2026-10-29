"use client";

import { useActionState } from "react";
import {
  finishBinanceAction,
  startBinanceAction,
  type BinanceState,
} from "@/app/actions/connections";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { t } from "@/lib/i18n";

interface AccountChoice {
  readonly id: string;
  readonly name: string;
}

export function BinanceWizard({
  spaceId,
  accounts,
}: {
  readonly spaceId: string;
  readonly accounts: readonly AccountChoice[];
}) {
  const [started, startAction] = useActionState<BinanceState, FormData>(startBinanceAction, {});
  const [finished, finishAction] = useActionState<BinanceState, FormData>(finishBinanceAction, {});
  const connectionId = started.connectionId;
  const cancelled = finished.cancelled === true;

  return (
    <>
      {connectionId === undefined || cancelled ? (
        <form className={styles.form} action={startAction}>
          <h2>{t("connections.binance.step1")}</h2>
          {cancelled ? <p role="alert">{t("connections.binance.cancelled")}</p> : null}
          <FormAlert error={started.error} />
          <input type="hidden" name="spaceId" value={spaceId} />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="accountId">
              {t("connections.binance.account.label")}
            </label>
            <p className={styles.hint} id="accountId-hint">
              {t("connections.binance.account.hint")}
            </p>
            <select
              className={styles.input}
              id="accountId"
              name="accountId"
              defaultValue={accounts[0]?.id}
              aria-describedby={
                started.fieldErrors?.accountId ? "accountId-hint accountId-error" : "accountId-hint"
              }
              aria-invalid={started.fieldErrors?.accountId ? "true" : undefined}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {started.fieldErrors?.accountId ? (
              <p className={styles.error} id="accountId-error">
                {t(started.fieldErrors.accountId)}
              </p>
            ) : null}
          </div>
          <SubmitButton>
            {cancelled ? t("connections.binance.restart") : t("connections.binance.step1_submit")}
          </SubmitButton>
        </form>
      ) : (
        <>
          <section aria-labelledby="paso2">
            <h2 id="paso2">{t("connections.binance.step2")}</h2>
            <p>{t("connections.binance.step2_body")}</p>
            <label className={styles.label} htmlFor="publicKey">
              {t("connections.binance.public_key")}
            </label>
            <textarea
              id="publicKey"
              className={styles.input}
              readOnly
              rows={6}
              value={started.publicKeyPem ?? ""}
            />
            <p className={styles.hint}>
              {t("connections.binance.fingerprint", { fingerprint: started.fingerprint ?? "" })}
            </p>
          </section>
          <form className={styles.form} action={finishAction}>
            <h2>{t("connections.binance.step3")}</h2>
            <FormAlert error={finished.error} />
            <input type="hidden" name="spaceId" value={spaceId} />
            <input type="hidden" name="connectionId" value={connectionId} />
            <Field
              id="apiKey"
              name="apiKey"
              label={t("connections.binance.api_key.label")}
              hint={t("connections.binance.api_key.hint")}
              autoComplete="off"
              maxLength={128}
              error={finished.fieldErrors?.apiKey}
            />
            <SubmitButton>{t("connections.binance.step3_submit")}</SubmitButton>
          </form>
        </>
      )}
    </>
  );
}

"use client";

import { useActionState } from "react";
import { linkBankAccountsAction } from "@/app/actions/connections";
import { FormAlert, SubmitButton } from "@/components/fields";
import type { FormState } from "@/components/form-state";
import styles from "@/components/fields.module.css";
import { t } from "@/lib/i18n";

interface BankAccountChoice {
  readonly uid: string;
  readonly hint: string;
  readonly currency: string;
}
interface MyAccount {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
}

export function BankLink({
  spaceId,
  connectionId,
  bankAccounts,
  mine,
}: {
  readonly spaceId: string;
  readonly connectionId: string;
  readonly bankAccounts: readonly BankAccountChoice[];
  readonly mine: readonly MyAccount[];
}) {
  const [state, action] = useActionState<FormState, FormData>(linkBankAccountsAction, {});
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="connectionId" value={connectionId} />
      {bankAccounts.map((bank) => (
        <div className={styles.field} key={bank.uid}>
          <label className={styles.label} htmlFor={`account-${bank.uid}`}>
            {t("connections.bank.account_label", { hint: bank.hint, currency: bank.currency })}
          </label>
          <select
            className={styles.input}
            id={`account-${bank.uid}`}
            name={`account:${bank.uid}`}
            defaultValue=""
          >
            <option value="">{t("connections.bank.dont_link")}</option>
            {mine
              .filter((a) => a.currency === bank.currency)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
      ))}
      <p className={styles.hint}>{t("connections.bank.link_hint")}</p>
      <SubmitButton>{t("connections.bank.link_submit")}</SubmitButton>
    </form>
  );
}

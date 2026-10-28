"use client";

import { MOVEMENT_KINDS, type MovementKind } from "@mymoney/schemas";
import { useActionState, useState } from "react";
import { addMovementAction } from "@/app/actions/movements";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import { t } from "@/lib/i18n";

interface AccountChoice {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
}

function AccountSelect({
  id,
  label,
  accounts,
  error,
  defaultValue,
}: {
  readonly id: string;
  readonly label: string;
  readonly accounts: readonly AccountChoice[];
  readonly error?: string | undefined;
  readonly defaultValue?: string | undefined;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select
        className={styles.input}
        id={id}
        name={id}
        defaultValue={defaultValue ?? accounts[0]?.id}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.currency})
          </option>
        ))}
      </select>
      {error ? (
        <p className={styles.error} id={`${id}-error`}>
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}

export function AddMovementForm({
  spaceId,
  today,
  accounts,
}: {
  readonly spaceId: string;
  readonly today: string;
  readonly accounts: readonly AccountChoice[];
}) {
  const [state, action] = useActionState(addMovementAction, INITIAL_FORM_STATE);
  const [kind, setKind] = useState<MovementKind>("expense");
  const errors = state.fieldErrors;
  const isTransfer = kind === "transfer";
  return (
    <form className={styles.form} action={action}>
      <FormAlert error={state.error} />
      <input type="hidden" name="spaceId" value={spaceId} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="kind">
          {t("movement.kind.label")}
        </label>
        <select
          className={styles.input}
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as MovementKind);
          }}
        >
          {MOVEMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`movement.kind.${k}`)}
            </option>
          ))}
        </select>
        {errors?.kind ? <p className={styles.error}>{t(errors.kind)}</p> : null}
      </div>
      <AccountSelect
        id="accountId"
        label={isTransfer ? t("movement.account.from") : t("movement.account.label")}
        accounts={accounts}
        error={errors?.accountId}
      />
      {isTransfer ? (
        <AccountSelect
          id="toAccountId"
          label={t("movement.account.to")}
          accounts={accounts}
          error={errors?.toAccountId}
          defaultValue={accounts[1]?.id ?? accounts[0]?.id}
        />
      ) : null}
      <Field
        id="amount"
        name="amount"
        label={t("movement.amount.label")}
        hint={t("movement.amount.hint")}
        inputMode="decimal"
        autoComplete="off"
        maxLength={32}
        error={errors?.amount}
      />
      <Field
        id="occurredOn"
        name="occurredOn"
        type="date"
        label={t("movement.date.label")}
        defaultValue={today}
        error={errors?.occurredOn}
      />
      <Field
        id="description"
        name="description"
        label={t("movement.description.label")}
        maxLength={200}
        autoComplete="off"
        required={false}
        error={errors?.description}
      />
      <SubmitButton>{t("movement.submit")}</SubmitButton>
    </form>
  );
}

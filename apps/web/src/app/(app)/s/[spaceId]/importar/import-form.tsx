"use client";

import { isCurrencyCode, money } from "@mymoney/finance-core";
import { useActionState, useState } from "react";
import {
  confirmImportAction,
  discardImportAction,
  previewImportAction,
  undoImportAction,
} from "@/app/actions/import";
import { Amount } from "@/components/amount";
import { Field, FormAlert, SubmitButton } from "@/components/fields";
import styles from "@/components/fields.module.css";
import { INITIAL_FORM_STATE } from "@/components/form-state";
import type { ImportState } from "@/components/import-state";
import { t } from "@/lib/i18n";

interface AccountChoice {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
}

const INITIAL: ImportState = INITIAL_FORM_STATE;

export function ImportForm({
  spaceId,
  accounts,
}: {
  readonly spaceId: string;
  readonly accounts: readonly AccountChoice[];
}) {
  const [preview, previewAction] = useActionState(previewImportAction, INITIAL);
  const [confirm, confirmAction] = useActionState(confirmImportAction, INITIAL);
  const [discard, discardAction] = useActionState(discardImportAction, INITIAL);
  const [undo, undoAction] = useActionState(undoImportAction, INITIAL);
  // Controlados: React vacía los campos sin controlar tras enviar, y la confirmación necesita el texto.
  const [text, setText] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [ownName, setOwnName] = useState("");

  const info = preview.preview;
  const errors = preview.fieldErrors;
  const finished = confirm.done ?? undefined;
  const closed = Boolean(discard.discarded) || Boolean(undo.undone);

  if (closed) {
    return <p role="status">{undo.undone ? t("import.undone") : t("import.discarded")}</p>;
  }

  if (finished) {
    return (
      <div className={styles.form}>
        <p role="status">{t("import.done", { count: String(finished.imported) })}</p>
        <form action={undoAction}>
          <FormAlert error={undo.error} />
          <input type="hidden" name="spaceId" value={spaceId} />
          <input type="hidden" name="batchId" value={finished.batchId} />
          <SubmitButton>{t("import.undo")}</SubmitButton>
        </form>
        <p className={styles.hint}>{t("import.undo_hint")}</p>
      </div>
    );
  }

  const hidden = (
    <>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="ownName" value={ownName} />
      <input type="hidden" name="text" value={text} />
    </>
  );

  return (
    <div className={styles.form}>
      <form className={styles.form} action={previewAction}>
        <FormAlert error={preview.error} />
        <input type="hidden" name="spaceId" value={spaceId} />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="accountId">
            {t("import.account.label")}
          </label>
          <select
            className={styles.input}
            id="accountId"
            name="accountId"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
          {errors?.accountId ? <p className={styles.error}>{t(errors.accountId)}</p> : null}
        </div>
        <Field
          id="ownName"
          name="ownName"
          label={t("import.own_name.label")}
          hint={t("import.own_name.hint")}
          maxLength={120}
          autoComplete="off"
          required={false}
          defaultValue={ownName}
          error={errors?.ownName}
          onValueChange={setOwnName}
        />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="text">
            {t("import.text.label")}
          </label>
          <p className={styles.hint} id="text-hint">
            {t("import.text.hint")}
          </p>
          <textarea
            className={styles.input}
            id="text"
            name="text"
            rows={8}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
            }}
            aria-describedby={errors?.text ? "text-hint text-error" : "text-hint"}
            aria-invalid={errors?.text ? "true" : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          {errors?.text ? (
            <p className={styles.error} id="text-error">
              {t(errors.text)}
            </p>
          ) : null}
        </div>
        <SubmitButton>{t("import.preview")}</SubmitButton>
      </form>

      {info ? (
        <section aria-labelledby="vista-previa">
          <h2 id="vista-previa">{t("import.preview.title")}</h2>
          {info.alreadyImported ? (
            <p role="status">{t("import.already")}</p>
          ) : (
            <>
              <ul>
                <li>{t("import.count.new", { count: String(info.newCount) })}</li>
                {info.duplicateCount > 0 ? (
                  <li>{t("import.count.duplicate", { count: String(info.duplicateCount) })}</li>
                ) : null}
                {info.internal > 0 ? (
                  <li>{t("import.count.internal", { count: String(info.internal) })}</li>
                ) : null}
                {info.pending > 0 ? (
                  <li>{t("import.count.pending", { count: String(info.pending) })}</li>
                ) : null}
                {info.unreadable > 0 ? (
                  <li>{t("import.count.unreadable", { count: String(info.unreadable) })}</li>
                ) : null}
              </ul>
              {info.from && info.to ? (
                <p>{t("import.range", { from: info.from, to: info.to })}</p>
              ) : null}
              {info.sample.length > 0 ? (
                <ul>
                  {info.sample.map((row) => (
                    <li key={`${row.date}-${row.description}-${row.minor}`}>
                      {row.date} · {row.description} ·{" "}
                      {isCurrencyCode(row.currency) ? (
                        <Amount value={money(BigInt(row.minor), row.currency)} signed />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <FormAlert error={confirm.error} />
              {info.newCount > 0 ? (
                <form action={confirmAction}>
                  {hidden}
                  <input type="hidden" name="batchId" value={info.batchId} />
                  <SubmitButton>
                    {t("import.confirm", { count: String(info.newCount) })}
                  </SubmitButton>
                </form>
              ) : null}
              <form action={discardAction}>
                <FormAlert error={discard.error} />
                <input type="hidden" name="spaceId" value={spaceId} />
                <input type="hidden" name="batchId" value={info.batchId} />
                <SubmitButton>{t("common.cancel")}</SubmitButton>
              </form>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

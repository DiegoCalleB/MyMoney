"use client";

import { useRef, useState, useTransition } from "react";
import { askAssistantAction } from "@/app/actions/assistant";
import fields from "@/components/fields.module.css";
import { t } from "@/lib/i18n";
import styles from "./asistente.module.css";

interface Turn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** Los textos de ejemplo se resuelven en el servidor (el catálogo vive allí) y llegan como props. */
export function AssistantChat({
  spaceId,
  suggestions,
}: {
  readonly spaceId: string;
  readonly suggestions: readonly string[];
}) {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  const send = (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    const next: readonly Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setError(null);
    if (box.current) box.current.value = "";
    startTransition(async () => {
      const reply = await askAssistantAction({
        spaceId,
        messages: next.slice(-12).map((m) => ({ ...m })),
      });
      if (reply.ok) setTurns([...next, { role: "assistant", content: reply.text }]);
      else setError(reply.error);
    });
  };

  return (
    <section aria-labelledby="chat-title" className={styles.chat}>
      <h2 id="chat-title" className={styles.h2}>
        {t("assistant.title")}
      </h2>
      <ul className={styles.turns} aria-live="polite">
        {turns.map((turn, i) => (
          <li key={i} className={turn.role === "user" ? styles.user : styles.bot}>
            <strong>
              {turn.role === "user" ? t("assistant.chat.you") : t("assistant.chat.bot")}
            </strong>
            <p className={styles.text}>{turn.content}</p>
          </li>
        ))}
        {pending ? (
          <li className={styles.bot}>
            <p role="status">{t("assistant.chat.thinking")}</p>
          </li>
        ) : null}
      </ul>
      {error ? (
        <p className={fields.alert} role="alert">
          {t(error)}
        </p>
      ) : null}
      {turns.length === 0 ? (
        <div>
          <p className={styles.muted}>{t("assistant.chat.suggestions")}</p>
          <ul className={styles.suggestions}>
            {suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className={styles.suggestion}
                  onClick={() => {
                    send(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <form
        className={fields.form}
        onSubmit={(event) => {
          event.preventDefault();
          send(box.current?.value ?? "");
        }}
      >
        <label className={fields.label} htmlFor="assistant-question">
          {t("assistant.chat.label")}
        </label>
        <textarea
          id="assistant-question"
          ref={box}
          className={fields.input}
          rows={3}
          maxLength={1500}
          required
        />
        <button className={fields.submit} type="submit" disabled={pending} aria-disabled={pending}>
          {t("assistant.chat.submit")}
        </button>
      </form>
    </section>
  );
}

"use client";

import { t } from "@/lib/i18n";
import styles from "./page.module.css";

/** Mensaje humano sin detalles técnicos; la referencia permite encontrar el error en los logs. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("error.title")}</h1>
      <p className={styles.lead}>{t("error.body")}</p>
      {digest ? <p className={styles.note}>{t("error.reference", { digest })}</p> : null}
      <button
        type="button"
        className={styles.primary}
        onClick={() => {
          retry();
        }}
      >
        {t("error.retry")}
      </button>
    </main>
  );
}

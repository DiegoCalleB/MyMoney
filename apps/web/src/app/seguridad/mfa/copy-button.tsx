"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "../../page.module.css";

/** Copia la clave al portapapeles y lo anuncia a los lectores de pantalla. */
export function CopyButton({ value }: { readonly value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        className={styles.secondary}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
          });
        }}
      >
        {t("mfa.enroll.copy")}
      </button>
      <span role="status" className={styles.note}>
        {copied ? t("mfa.enroll.copied") : ""}
      </span>
    </>
  );
}

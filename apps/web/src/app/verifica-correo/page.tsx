import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "../page.module.css";

export const metadata: Metadata = { title: t("auth.check_email.title") };

export default function CheckEmailPage() {
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("auth.check_email.title")}</h1>
      <p className={styles.lead}>{t("auth.check_email.body")}</p>
      <Link className={styles.secondary} href="/entrar">
        {t("auth.sign_in.title")}
      </Link>
    </main>
  );
}

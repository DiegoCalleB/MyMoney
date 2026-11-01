import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "../page.module.css";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: t("auth.forgot.title") };

export default function ForgotPage() {
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("auth.forgot.title")}</h1>
      <p className={styles.lead}>{t("auth.forgot.intro")}</p>
      <ForgotForm />
      <p className={styles.links}>
        <Link href="/entrar">{t("auth.forgot.back")}</Link>
      </p>
    </main>
  );
}

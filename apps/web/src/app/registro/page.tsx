import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "../page.module.css";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: t("auth.sign_up.title") };

export default function SignUpPage() {
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("auth.sign_up.title")}</h1>
      <SignUpForm />
      <p className={styles.links}>
        {t("auth.sign_up.have_account")} <Link href="/entrar">{t("landing.sign_in")}</Link>
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "../page.module.css";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: t("auth.sign_in.title") };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("auth.sign_in.title")}</h1>
      <SignInForm {...(error === "callback" ? { initialError: "auth.callback_failed" } : {})} />
      <p className={styles.links}>
        {t("auth.sign_in.no_account")} <Link href="/registro">{t("landing.sign_up")}</Link>
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { getAuthState } from "@/server/auth";
import styles from "../page.module.css";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: t("auth.reset.title") };

export default async function ResetPasswordPage() {
  const state = await getAuthState();
  if (state.kind === "anonymous") redirect("/entrar?error=callback");
  // Con segundo factor, primero se verifica el código y se vuelve aquí.
  if (state.kind === "verify") redirect("/verificar-mfa?next=restablecer");
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("auth.reset.title")}</h1>
      <p className={styles.lead}>{t("auth.reset.intro")}</p>
      <ResetForm />
    </main>
  );
}

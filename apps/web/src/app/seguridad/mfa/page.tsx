import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { t } from "@/lib/i18n";
import { getAuthState } from "@/server/auth";
import styles from "../../page.module.css";
import { EnrollFlow } from "./enroll-flow";

export const metadata: Metadata = { title: t("mfa.enroll.title") };

export default async function EnrollMfaPage() {
  const state = await getAuthState();
  if (state.kind === "anonymous") redirect("/entrar");
  if (state.kind === "ready") redirect("/hogares");
  if (state.kind === "verify") redirect("/verificar-mfa");

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("mfa.enroll.title")}</h1>
      <p className={styles.lead}>{t("mfa.enroll.intro")}</p>
      <EnrollFlow />
      <form action={signOutAction} className={styles.links}>
        <button type="submit" className={styles.secondary}>
          {t("common.sign_out")}
        </button>
      </form>
    </main>
  );
}

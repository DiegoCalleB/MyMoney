import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { t } from "@/lib/i18n";
import { getAuthState } from "@/server/auth";
import styles from "../page.module.css";
import { TotpForm } from "./totp-form";

export const metadata: Metadata = { title: t("mfa.verify.title") };

export default async function VerifyMfaPage() {
  const state = await getAuthState();
  if (state.kind === "anonymous") redirect("/entrar");
  if (state.kind === "ready") redirect("/hogares");
  if (state.kind === "enroll") redirect("/seguridad/mfa");

  const { data } = await state.supabase.auth.mfa.listFactors();
  const factor = data?.totp[0];
  if (!factor) redirect("/seguridad/mfa");

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("mfa.verify.title")}</h1>
      <p className={styles.lead}>{t("mfa.verify.intro")}</p>
      <TotpForm factorId={factor.id} submitLabel={t("mfa.verify.submit")} />
      <form action={signOutAction} className={styles.links}>
        <button type="submit" className={styles.secondary}>
          {t("common.sign_out")}
        </button>
      </form>
    </main>
  );
}

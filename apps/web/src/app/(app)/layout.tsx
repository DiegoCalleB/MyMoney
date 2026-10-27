import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { readMfaRequired } from "@/lib/env";
import { t } from "@/lib/i18n";
import { getAuthState } from "@/server/auth";
import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Solo se ve cuando el segundo factor es opcional y la persona aún no lo ha activado.
  const state = await getAuthState();
  const mfaPending = state.kind === "enroll" && !readMfaRequired();
  return (
    <>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label={t("nav.main")}>
          <Link className={styles.brand} href="/hogares">
            {t("app.name")}
          </Link>
          <Link href="/hogares">{t("nav.spaces")}</Link>
        </nav>
        <form action={signOutAction}>
          <button className={styles.signOut} type="submit">
            {t("common.sign_out")}
          </button>
        </form>
      </header>
      {mfaPending ? (
        <p className={styles.banner} role="note">
          {t("mfa.banner")} <Link href="/seguridad/mfa">{t("mfa.banner.cta")}</Link>
        </p>
      ) : null}
      {children}
    </>
  );
}

import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { PRIVACY_COOKIE, PrivacyToggle } from "@/components/privacy-toggle";
import { readMfaRequired } from "@/lib/env";
import { t } from "@/lib/i18n";
import { getAuthState } from "@/server/auth";
import styles from "./shell.module.css";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Solo se ve cuando el segundo factor es opcional y la persona aún no lo ha activado.
  const state = await getAuthState();
  const mfaPending = state.kind === "enroll" && !readMfaRequired();
  const hidden = (await cookies()).get(PRIVACY_COOKIE)?.value === "hidden";
  return (
    <div id="privacy-root" data-privacy={hidden ? "hidden" : "visible"}>
      <header className={styles.header}>
        <nav className={styles.nav} aria-label={t("nav.main")}>
          <Link className={styles.brand} href="/hogares">
            {t("app.name")}
          </Link>
          <Link href="/hogares">{t("nav.spaces")}</Link>
        </nav>
        <div className={styles.actions}>
          <PrivacyToggle initialHidden={hidden} />
          <form action={signOutAction}>
            <button className={styles.signOut} type="submit">
              {t("common.sign_out")}
            </button>
          </form>
        </div>
      </header>
      {mfaPending ? (
        <p className={styles.banner} role="note">
          {t("mfa.banner")} <Link href="/seguridad/mfa">{t("mfa.banner.cta")}</Link>
        </p>
      ) : null}
      {children}
    </div>
  );
}

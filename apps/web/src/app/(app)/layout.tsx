import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth";
import { t } from "@/lib/i18n";
import styles from "./shell.module.css";

export default function AppLayout({ children }: { children: ReactNode }) {
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
      {children}
    </>
  );
}

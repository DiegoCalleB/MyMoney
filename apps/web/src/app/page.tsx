import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("landing.title")}</h1>
      <p className={styles.lead}>{t("app.tagline")}</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/registro">
          {t("landing.sign_up")}
        </Link>
        <Link className={styles.secondary} href="/entrar">
          {t("landing.sign_in")}
        </Link>
      </div>
      <p className={styles.note}>{t("app.disclaimer")}</p>
    </main>
  );
}

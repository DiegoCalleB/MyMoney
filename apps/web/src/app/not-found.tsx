import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export default function NotFound() {
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("not_found.title")}</h1>
      <Link className={styles.primary} href="/">
        {t("not_found.back")}
      </Link>
    </main>
  );
}

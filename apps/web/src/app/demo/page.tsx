import type { Metadata } from "next";
import Link from "next/link";
import { calendarDate } from "@mymoney/finance-core";
import { HomeView } from "@/components/home-view";
import { calendarDateInZone } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { buildDemoHome } from "@/server/demo-data";
import styles from "../page.module.css";
import shell from "../(app)/shell.module.css";

export const metadata: Metadata = { title: t("demo.title") };

/**
 * Demo pública con datos ficticios: el mismo inicio que ve cualquier persona, calculado con el
 * mismo código, pero sobre un hogar inventado. No lee la base de datos ni exige sesión.
 */
export default function DemoPage() {
  const data = buildDemoHome(calendarDate(calendarDateInZone(new Date(), "Europe/Madrid")));
  return (
    <>
      <p className={shell.banner} role="note">
        <strong>{t("demo.banner")}</strong> {t("demo.banner.body")}{" "}
        <Link href="/registro">{t("landing.sign_up")}</Link> ·{" "}
        <Link href="/entrar">{t("demo.sign_in")}</Link>
      </p>
      <HomeView data={data} demo />
      <p className={[styles.main, styles.note].join(" ")}>{t("demo.footer")}</p>
    </>
  );
}

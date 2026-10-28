import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";
import styles from "../../../../../page.module.css";
import { BinanceWizard } from "./binance-wizard";

export const metadata: Metadata = { title: t("connections.binance.title") };

export default async function ConnectBinancePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const { supabase } = await requireReadyUser();
  const space = await loadSpace(supabase, parsed.data);
  if (!space) notFound();
  const today = calendarDateInZone(new Date(), space.timezone);
  const accounts = (await loadAccountOptions(supabase, space.id, today)).filter(
    (a) => !a.is_liability && a.currency === "EUR",
  );

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("connections.binance.title")}</h1>
      <p className={styles.lead}>{t("connections.binance.intro")}</p>
      {accounts.length === 0 ? (
        <p>{t("connections.no_accounts")}</p>
      ) : (
        <BinanceWizard
          spaceId={space.id}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        />
      )}
      <p className={styles.links}>
        <Link href={`/s/${space.id}/conexiones`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

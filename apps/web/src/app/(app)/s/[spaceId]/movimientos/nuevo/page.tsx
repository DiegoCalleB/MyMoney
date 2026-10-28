import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";
import styles from "../../../../../page.module.css";
import { AddMovementForm } from "./add-movement-form";

export const metadata: Metadata = { title: t("movement.new.title") };

export default async function NewMovementPage({
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
  const accounts = await loadAccountOptions(supabase, space.id, today);

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("movement.new.title")}</h1>
      {accounts.length === 0 ? (
        <p className={styles.lead}>{t("movement.no_accounts")}</p>
      ) : (
        <AddMovementForm
          spaceId={space.id}
          today={today}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        />
      )}
      <p className={styles.links}>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

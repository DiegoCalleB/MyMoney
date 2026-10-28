import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadSpace } from "@/server/queries/home";
import styles from "../../../../../page.module.css";
import { AddAccountForm } from "./add-account-form";

export const metadata: Metadata = { title: t("account.new.title") };

export default async function NewAccountPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();

  const { supabase } = await requireReadyUser();
  const space = await loadSpace(supabase, parsed.data);
  if (!space) notFound();

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("account.new.title")}</h1>
      <AddAccountForm spaceId={space.id} baseCurrency={space.base_currency} />
      <p className={styles.links}>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

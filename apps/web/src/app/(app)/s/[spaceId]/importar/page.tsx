import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadRecentBatches } from "@/server/imports";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";
import styles from "../../../../page.module.css";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: t("import.title") };

export default async function ImportPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();

  const { supabase } = await requireReadyUser();
  const space = await loadSpace(supabase, parsed.data);
  if (!space) notFound();
  const today = calendarDateInZone(new Date(), space.timezone);
  const accounts = await loadAccountOptions(supabase, space.id, today);
  const batches = await loadRecentBatches(supabase, space.id);
  const names = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("import.title")}</h1>
      <p className={styles.lead}>{t("import.intro")}</p>
      {accounts.length === 0 ? (
        <p className={styles.lead}>{t("import.no_accounts")}</p>
      ) : (
        <ImportForm
          spaceId={space.id}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        />
      )}
      {batches.length > 0 ? (
        <section aria-labelledby="recientes">
          <h2 id="recientes">{t("import.recent")}</h2>
          <ul>
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/s/${space.id}/importar/${b.id}`}>
                  {names.get(b.account_id) ?? "—"} · {b.created_at.slice(0, 10)} ·{" "}
                  {t(`import.status.${b.status}`)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className={styles.links}>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

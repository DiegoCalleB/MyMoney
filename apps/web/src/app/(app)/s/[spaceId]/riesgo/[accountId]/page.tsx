import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { COMPOSITION_CLASSES } from "@mymoney/schemas";
import { z } from "zod";
import { bpsToInputText } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadHome } from "@/server/queries/home";
import { loadCompositions } from "@/server/queries/risk";
import styles from "../../../../../page.module.css";
import { CompositionForm } from "./composition-form";

export const metadata: Metadata = { title: t("risk.title") };

export default async function CompositionPage({
  params,
}: {
  params: Promise<{ spaceId: string; accountId: string }>;
}) {
  const raw = await params;
  const parsed = z.object({ spaceId: z.uuid(), accountId: z.uuid() }).safeParse(raw);
  if (!parsed.success) notFound();
  const { spaceId, accountId } = parsed.data;

  const { supabase } = await requireReadyUser();
  const [home, compositions] = await Promise.all([
    loadHome(supabase, spaceId),
    loadCompositions(supabase, spaceId),
  ]);
  const account = home?.accounts.get(accountId);
  if (!home || !account) notFound();

  const current = new Map(
    compositions
      .filter((c) => c.account_id === accountId)
      .map((c) => [c.asset_class, c.weight_bps]),
  );
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("risk.edit.title", { name: account.name })}</h1>
      <p className={styles.lead}>{t("risk.edit.lead")}</p>
      <CompositionForm
        spaceId={spaceId}
        accountId={accountId}
        rows={COMPOSITION_CLASSES.map((asset) => ({
          asset,
          current: current.has(asset) ? bpsToInputText(current.get(asset) ?? 0) : "",
        }))}
      />
      <p className={styles.links}>
        <Link className={styles.secondary} href={`/s/${spaceId}/riesgo`}>
          {t("risk.edit.back")}
        </Link>
      </p>
    </main>
  );
}

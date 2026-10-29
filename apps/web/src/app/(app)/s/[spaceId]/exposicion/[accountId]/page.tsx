import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { COMPOSITION_KINDS, isDimension } from "@/server/exposure-model";
import styles from "../../../../../page.module.css";
import { CompositionForm } from "./composition-form";

export const metadata: Metadata = { title: t("exposure.form.title") };

export default async function CompositionPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string; accountId: string }>;
  searchParams: Promise<{ dimension?: string }>;
}) {
  const ids = z.object({ spaceId: z.uuid(), accountId: z.uuid() }).safeParse(await params);
  if (!ids.success) notFound();
  const query = await searchParams;
  const dimension = isDimension(query.dimension) ? query.dimension : "asset_class";

  const { supabase } = await requireReadyUser();
  const found = await supabase
    .from("accounts")
    .select("name,kind")
    .eq("id", ids.data.accountId)
    .eq("space_id", ids.data.spaceId)
    .maybeSingle();
  const account = z.object({ name: z.string(), kind: z.string() }).safeParse(found.data);
  if (!account.success || !COMPOSITION_KINDS.has(account.data.kind as never)) notFound();

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("exposure.form.title")}</h1>
      <p className={styles.lead}>{t("exposure.form.intro", { name: account.data.name })}</p>
      <CompositionForm
        spaceId={ids.data.spaceId}
        accountId={ids.data.accountId}
        initialDimension={dimension}
      />
      <p className={styles.links}>
        <Link href={`/s/${ids.data.spaceId}/exposicion?dimension=${dimension}`}>
          {t("common.back")}
        </Link>
      </p>
    </main>
  );
}

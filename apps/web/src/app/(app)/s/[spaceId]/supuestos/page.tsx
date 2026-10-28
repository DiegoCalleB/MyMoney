import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadHome } from "@/server/queries/home";
import styles from "../../../../page.module.css";
import { AssumptionsForm } from "./assumptions-form";

export const metadata: Metadata = { title: t("assumptions.title") };

export default async function AssumptionsPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();

  const { supabase } = await requireReadyUser();
  const home = await loadHome(supabase, parsed.data);
  if (!home) notFound();
  const current = home.monthlyExpense;
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("assumptions.title")}</h1>
      <p className={styles.lead}>{t("assumptions.intro")}</p>
      <AssumptionsForm
        spaceId={home.space.id}
        currency={home.space.base_currency}
        // Importe en unidades principales, con coma decimal, para editarlo tal cual.
        initial={current ? (Number(current.minor) / 100).toFixed(2).replace(".", ",") : ""}
      />
      <p className={styles.links}>
        <Link href={`/s/${home.space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

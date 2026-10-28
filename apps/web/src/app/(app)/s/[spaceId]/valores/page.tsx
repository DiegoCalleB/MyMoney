import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadAccountOptions, loadHome } from "@/server/queries/home";
import styles from "../../../../page.module.css";
import { UpdateValuesForm } from "./update-values-form";

export const metadata: Metadata = { title: t("values.title") };

export default async function UpdateValuesPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();

  const { supabase } = await requireReadyUser();
  const home = await loadHome(supabase, parsed.data);
  if (!home) notFound();
  const accounts = await loadAccountOptions(supabase, home.space.id, home.today);
  const lines = new Map(home.result.explanation.accounts.map((l) => [l.accountId, l]));

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("values.title")}</h1>
      <p className={styles.lead}>{t("values.intro")}</p>
      <UpdateValuesForm
        spaceId={home.space.id}
        today={home.today}
        accounts={accounts.map((a) => {
          const line = lines.get(a.id);
          return {
            id: a.id,
            name: a.name,
            currency: a.currency,
            isLiability: a.is_liability,
            // Una deuda se muestra en positivo (lo que se debe), como se escribe.
            current: line
              ? formatMoney(
                  a.is_liability
                    ? { ...line.original, minor: -line.original.minor }
                    : line.original,
                )
              : "",
          };
        })}
      />
      <p className={styles.links}>
        <Link href={`/s/${home.space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

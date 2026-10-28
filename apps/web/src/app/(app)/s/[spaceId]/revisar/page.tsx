import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { money } from "@mymoney/finance-core";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadReview } from "@/server/queries/review";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("review.title") };

const day = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDate = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));

export default async function ReviewPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();

  const { supabase } = await requireReadyUser();
  const data = await loadReview(supabase, parsed.data);
  if (!data) notFound();
  const { space, anomalies, categoryNames, dataQuality } = data;
  const cur = space.base_currency;
  const minor = (value: string | undefined) => formatMoney(money(BigInt(value ?? "0"), cur));

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("review.title")}</h1>
      <p className={styles.lead}>{t("review.intro")}</p>

      {anomalies.length === 0 ? (
        <p className={styles.lead}>{t("review.empty")}</p>
      ) : (
        <ul className={shell.list}>
          {anomalies.map((a) => {
            const category =
              (a.categoryId ? categoryNames.get(a.categoryId) : undefined) ??
              t("review.uncategorized");
            return (
              <li key={`${a.movementId}-${a.ruleId}`} className={shell.item}>
                <span>
                  <strong>{a.description ?? t("review.uncategorized")}</strong>
                  <br />
                  <span className={shell.muted}>
                    {fmtDate(a.date)} ·{" "}
                    {t(a.messageKey, {
                      amount: minor(a.params.amount),
                      usual: minor(a.params.usual),
                      date: fmtDate(a.params.date ?? a.date),
                      other: fmtDate(a.params.other ?? a.date),
                      times: (a.params.times ?? "").replace(".", ","),
                      category,
                    })}
                  </span>
                </span>
                <span className={shell.amountCol}>
                  <Amount value={a.amount} />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {dataQuality === "low" ? <p className={shell.muted}>{t("review.low_data")}</p> : null}
      <details>
        <summary>{t("review.why.summary")}</summary>
        <p className={shell.muted}>{t("review.note")}</p>
      </details>
      <p className={styles.links}>
        <Link href={`/s/${space.id}/gastos`}>{t("spend.link")}</Link>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

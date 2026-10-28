import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadReturns } from "@/server/queries/returns";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";
import { SummaryView } from "./summary";

export const metadata: Metadata = { title: t("returns.title") };

export default async function ReturnsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const spaceId = parsed.data;

  const { supabase } = await requireReadyUser();
  const data = await loadReturns(supabase, spaceId);
  if (!data) notFound();
  const { model } = data;

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("returns.title")}</h1>
      <p className={styles.lead}>{t("returns.lead")}</p>

      {model.accounts.length === 0 ? (
        <p className={shell.muted}>{t("returns.empty")}</p>
      ) : (
        <>
          <section className={styles.section} aria-labelledby="conjunto">
            <h2 id="conjunto" className={styles.heading2}>
              {t("returns.total.title")}
            </h2>
            {model.total ? (
              <SummaryView summary={model.total} />
            ) : (
              <p className={shell.muted}>{t("returns.total.needs_two")}</p>
            )}
          </section>

          <section className={styles.section} aria-labelledby="por-cuenta">
            <h2 id="por-cuenta" className={styles.heading2}>
              {t("returns.accounts")}
            </h2>
            <ul className={shell.list}>
              {model.accounts.map((account) => {
                const meta = model.meta.get(account.accountId);
                return (
                  <li key={account.accountId} className={shell.group}>
                    <details>
                      <summary className={shell.groupSummary}>
                        <span>
                          {meta?.name}
                          <br />
                          <span className={shell.muted}>
                            {meta ? t(`account.kind.${meta.kind}`) : ""}
                          </span>
                        </span>
                      </summary>
                      <SummaryView summary={account.summary} />
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <p className={styles.links}>
        <Link className={styles.secondary} href={`/s/${spaceId}/inicio`}>
          {t("nav.home")}
        </Link>
      </p>
    </main>
  );
}

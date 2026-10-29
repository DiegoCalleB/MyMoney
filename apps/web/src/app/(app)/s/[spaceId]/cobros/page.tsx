import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { formatPercentSigned } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadIncome } from "@/server/queries/income";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("income.title") };

export default async function IncomePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();

  const { supabase } = await requireReadyUser();
  const data = await loadIncome(supabase, parsed.data);
  if (!data) notFound();
  const { space, model } = data;

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("income.title")}</h1>
      <p className={styles.lead}>{t("income.intro")}</p>
      {model === null ? (
        <>
          <p>{t("income.empty")}</p>
          <p className={styles.links}>
            <Link className={styles.primary} href={`/s/${space.id}/movimientos/nuevo`}>
              {t("income.empty.add")}
            </Link>
          </p>
        </>
      ) : (
        <>
          <dl className={shell.returnGrid}>
            <div>
              <dt className={shell.muted}>{t("income.year")}</dt>
              <dd>
                <Amount value={model.result.value.trailingYear} />
              </dd>
            </div>
            <div>
              <dt className={shell.muted}>{t("income.dividends")}</dt>
              <dd>
                <Amount value={model.result.value.trailingDividends} />
              </dd>
            </div>
            <div>
              <dt className={shell.muted}>{t("income.interest")}</dt>
              <dd>
                <Amount value={model.result.value.trailingInterest} />
              </dd>
            </div>
            {model.result.value.trailingYield ? (
              <div>
                <dt className={shell.muted}>{t("income.yield")}</dt>
                <dd>{formatPercentSigned(model.result.value.trailingYield)}</dd>
              </div>
            ) : null}
            <div>
              <dt className={shell.muted}>{t("income.estimate")}</dt>
              <dd>
                <Amount value={model.result.value.nextYearEstimate} />
              </dd>
            </div>
          </dl>
          <p className={shell.muted}>{t("income.estimate.note")}</p>
          {model.ignored > 0 ? (
            <p className={shell.muted}>{t("income.ignored", { count: String(model.ignored) })}</p>
          ) : null}

          <h2 className={styles.heading2}>{t("income.months")}</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("income.col.month")}</th>
                <th scope="col">{t("income.col.dividend")}</th>
                <th scope="col">{t("income.col.interest")}</th>
                <th scope="col">{t("income.col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {[...model.result.value.months].reverse().map((m) => (
                <tr key={m.month}>
                  <th scope="row">{m.month}</th>
                  <td>
                    <Amount value={m.dividend} />
                  </td>
                  <td>
                    <Amount value={m.interest} />
                  </td>
                  <td>
                    <Amount value={m.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className={shell.explain}>
            <summary>{t("income.explain.summary")}</summary>
            <p>{t("income.explain.body")}</p>
            <ul>
              {model.result.explanation.caveats.map((code) => (
                <li key={code}>{t(code)}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      <p className={styles.links}>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

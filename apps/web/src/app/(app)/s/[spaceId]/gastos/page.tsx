import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { DonutChart } from "@/components/donut-chart";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadSpend } from "@/server/queries/spend";
import { shiftMonth } from "@/server/spend-model";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("spend.title") };

const monthName = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const percent = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 });

const label = (key: string) => monthName.format(new Date(`${key}-01T00:00:00Z`));

export default async function SpendPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const { mes } = await searchParams;

  const { supabase } = await requireReadyUser();
  const data = await loadSpend(supabase, parsed.data, mes, {
    uncategorized: t("spend.uncategorized"),
    other: t("home.charts.other"),
  });
  if (!data) notFound();
  const { space, month, summary, history } = data;
  const base = `/s/${space.id}/gastos`;
  const hasData = summary.categories.length > 0 || summary.income.minor > 0n;

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("spend.title")}</h1>

      <nav aria-label={t("spend.month")} className={shell.monthNav}>
        <Link className={shell.chip} href={`${base}?mes=${shiftMonth(month.key, -1)}`}>
          ← {t("spend.prev")}
        </Link>
        <strong aria-current="date">{label(month.key)}</strong>
        <Link className={shell.chip} href={`${base}?mes=${shiftMonth(month.key, 1)}`}>
          {t("spend.next")} →
        </Link>
      </nav>

      {!hasData ? (
        <p className={styles.lead}>{t("spend.empty")}</p>
      ) : (
        <>
          <dl className={shell.returnGrid}>
            <div>
              <dt className={shell.muted}>{t("spend.expense")}</dt>
              <dd>
                <Amount value={summary.expense} />
              </dd>
            </div>
            <div>
              <dt className={shell.muted}>{t("spend.income")}</dt>
              <dd>
                <Amount value={summary.income} />
              </dd>
            </div>
            <div>
              <dt className={shell.muted}>{t("spend.saved")}</dt>
              <dd>
                <Amount value={summary.saved} signed />
              </dd>
            </div>
          </dl>

          {summary.slices.length > 0 ? (
            <>
              <h2 className={styles.heading2}>{t("spend.by_category")}</h2>
              <DonutChart slices={summary.slices} label={t("spend.by_category")} />
              <ul className={shell.list}>
                {summary.categories.map((c) => (
                  <li key={c.key} className={shell.item}>
                    <span>{c.label}</span>
                    <span className={shell.amountCol}>
                      <Amount value={c.value} />
                      <br />
                      <span className={shell.muted}>{percent.format(c.shareBps / 10000)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      {history.length > 0 ? (
        <section aria-labelledby="mes-a-mes">
          <h2 id="mes-a-mes" className={styles.heading2}>
            {t("spend.history")}
          </h2>
          <ul className={shell.list}>
            {history.map((h) => {
              const key = h.month.slice(0, 7);
              return (
                <li key={key} className={shell.item}>
                  <Link
                    href={`${base}?mes=${key}`}
                    aria-current={key === month.key ? "page" : undefined}
                  >
                    {label(key)}
                  </Link>
                  <span className={shell.amountCol}>
                    <Amount value={{ minor: h.expense_minor, currency: h.currency }} />
                    <br />
                    <span className={shell.muted}>
                      {t("spend.income")}:{" "}
                      <Amount value={{ minor: h.income_minor, currency: h.currency }} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className={shell.muted}>{t("spend.note")}</p>
      <p className={styles.links}>
        <Link href={`/s/${space.id}/importar`}>{t("import.link")}</Link>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { LineChart, type ChartSeries } from "@/components/line-chart";
import { formatPercentSigned } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { isPeriod, PERIODS, TOTAL_ID, type PeriodKey } from "@/server/performance-model";
import { loadPerformance } from "@/server/queries/performance";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("perf.title") };

const percentAxis = new Intl.NumberFormat("es-ES", {
  style: "percent",
  maximumFractionDigits: 1,
});

export default async function PerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ cuenta?: string; periodo?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const query = await searchParams;
  const period: PeriodKey = isPeriod(query.periodo) ? query.periodo : "todo";

  const { supabase } = await requireReadyUser();
  const data = await loadPerformance(supabase, parsed.data, query.cuenta, period);
  if (!data) notFound();
  const { space, model } = data;
  const base = `/s/${space.id}/rentabilidad`;
  const link = (account: string, p: PeriodKey) =>
    `${base}?cuenta=${encodeURIComponent(account)}&periodo=${p}`;
  const nameOf = (id: string, name: string) => (id === TOTAL_ID ? t("perf.total") : name);

  const result = model.result;
  const last = result.ok ? result.value.points[result.value.points.length - 1] : undefined;
  const ratioSeries: ChartSeries[] = result.ok
    ? [
        {
          key: "ratio",
          label: t("perf.ratio"),
          tone: "main",
          points: result.value.points.flatMap((p) =>
            p.ratio ? [{ date: p.date, y: Number(p.ratio.toFixed(6)) }] : [],
          ),
        },
      ]
    : [];
  const money = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: model.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const valueSeries: ChartSeries[] = result.ok
    ? [
        {
          key: "value",
          label: t("perf.value"),
          tone: "main",
          points: result.value.points.map((p) => ({
            date: p.date,
            y: Number(p.value.minor) / 100,
          })),
        },
        {
          key: "contributed",
          label: t("perf.contributed"),
          tone: "muted",
          step: true,
          points: result.value.points.map((p) => ({
            date: p.date,
            y: Number(p.contributed.minor) / 100,
          })),
        },
      ]
    : [];

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("perf.title")}</h1>
      {model.options.length === 0 ? (
        <p className={styles.lead}>{t("returns.empty")}</p>
      ) : (
        <>
          <nav aria-label={t("perf.accounts")}>
            <ul className={shell.chips}>
              {model.options.map((o) => (
                <li key={o.id}>
                  <Link
                    href={link(o.id, period)}
                    className={shell.chip}
                    aria-current={o.id === model.selected ? "page" : undefined}
                  >
                    {nameOf(o.id, o.name)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t("perf.periods")}>
            <ul className={shell.chips}>
              {PERIODS.map((p) => (
                <li key={p}>
                  <Link
                    href={link(model.selected, p)}
                    className={shell.chip}
                    aria-current={p === period ? "page" : undefined}
                  >
                    {t(`perf.period.${p}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {!result.ok || !last ? (
            <p className={shell.muted}>{t("perf.empty")}</p>
          ) : (
            <>
              <dl className={shell.returnGrid}>
                <div>
                  <dt className={shell.muted}>{t("returns.value")}</dt>
                  <dd>
                    <Amount value={last.value} />
                  </dd>
                </div>
                <div>
                  <dt className={shell.muted}>{t("returns.contributed")}</dt>
                  <dd>
                    <Amount value={last.contributed} />
                  </dd>
                </div>
                <div>
                  <dt className={shell.muted}>{t("returns.gain")}</dt>
                  <dd>
                    <Amount value={last.gain} signed />
                    {last.ratio ? ` · ${formatPercentSigned(last.ratio)}` : ""}
                  </dd>
                </div>
              </dl>

              <h2 className={styles.heading2}>{t("perf.ratio.title")}</h2>
              <LineChart
                series={ratioSeries}
                format={(y) => percentAxis.format(y)}
                label={t("perf.ratio.title")}
              />

              <h2 className={styles.heading2}>{t("perf.value.title")}</h2>
              <div className="amount-chart">
                <LineChart
                  series={valueSeries}
                  format={(y) => money.format(y)}
                  label={t("perf.value.title")}
                />
              </div>
              <p className={[shell.muted, "privacy-note"].join(" ")}>{t("perf.privacy_note")}</p>

              <details className={shell.explain}>
                <summary>{t("returns.explain.summary")}</summary>
                <p>{t("perf.explain.body")}</p>
                <ul>
                  {result.value.explanation.caveats.map((code) => (
                    <li key={code}>{t(code)}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </>
      )}
      <p className={styles.links}>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { DonutChart } from "@/components/donut-chart";
import { LineChart, type ChartSeries } from "@/components/line-chart";
import { calendarDate, dec, money, profileFacts } from "@mymoney/finance-core";
import { formatMoney, formatPercentSigned, formatShare } from "@/lib/format";
import { isMessageKey, t } from "@/lib/i18n";
import { adviceParams } from "@/server/advice-format";
import { classifyAccounts } from "@/server/assistant-model";
import { changeSinceLastClose } from "@/server/history-model";
import { groupAccounts } from "@/server/group-accounts";
import { buildSlices, type SliceInput } from "@/server/chart-model";
import { requireReadyUser } from "@/server/auth";
import { loadHome } from "@/server/queries/home";
import { loadReview } from "@/server/queries/review";
import { noticeParams } from "@/server/home-model";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

const shortDate = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const fmtShort = (iso: string) => shortDate.format(new Date(`${iso}T00:00:00Z`));

export const metadata: Metadata = { title: t("home.title") };

export default async function HomePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const spaceId = parsed.data;

  const { supabase } = await requireReadyUser();
  const [data, review] = await Promise.all([
    loadHome(supabase, spaceId),
    // El aviso de cargos por revisar es accesorio: si falla, Inicio sigue funcionando.
    loadReview(supabase, spaceId).catch(() => null),
  ]);
  if (!data) notFound();

  const { space, result } = data;
  const { value, explanation } = result;
  const newAccount = `/s/${spaceId}/cuentas/nueva`;

  if (data.accounts.size === 0) {
    return (
      <main id="contenido" className={styles.main}>
        <h1 className={styles.title}>{space.name}</h1>
        <h2 className={styles.heading2}>{t("home.empty.title")}</h2>
        <p className={styles.lead}>{t("home.empty.body")}</p>
        <Link className={styles.primary} href={newAccount}>
          {t("home.empty.cta")}
        </Link>
      </main>
    );
  }

  const charts = buildCharts(data);
  const groups = groupAccounts(explanation.accounts, data.accounts, data.institutions);
  const renderReturn = (name: string, r: (typeof data.returns.accounts)[number]["result"]) => (
    <>
      <p className={shell.returnName}>{name}</p>
      <dl className={shell.returnGrid}>
        <div>
          <dt className={shell.muted}>{t("returns.contributed")}</dt>
          <dd>
            <Amount value={r.value.contributed} />
          </dd>
        </div>
        <div>
          <dt className={shell.muted}>{t("returns.value")}</dt>
          <dd>
            <Amount value={r.value.currentValue} />
          </dd>
        </div>
        <div>
          <dt className={shell.muted}>{t("returns.gain")}</dt>
          <dd>
            <Amount value={r.value.gain} signed />
            {r.value.simple ? ` · ${formatPercentSigned(r.value.simple)}` : ""}
          </dd>
        </div>
        {r.value.annualized ? (
          <div>
            <dt className={shell.muted}>{t("returns.annualized")}</dt>
            <dd>{formatPercentSigned(r.value.annualized)}</dd>
          </div>
        ) : null}
      </dl>
      <p className={shell.muted}>{t("returns.since", { date: r.explanation.firstFlowDate })}</p>
    </>
  );
  const renderLine = (line: (typeof explanation.accounts)[number]) => {
    const meta = data.accounts.get(line.accountId);
    const age = String(line.ageDays);
    return (
      <>
        <span>
          {meta?.name}
          <br />
          <span className={shell.muted}>
            {meta ? t(`account.kind.${meta.kind}`) : ""} ·{" "}
            {line.shareBps < 10000
              ? `${t("account.share.badge", { percent: String(line.shareBps / 100) })} · `
              : ""}
            {line.stale
              ? t("home.value.stale", { days: age })
              : line.ageDays === 0
                ? t("home.value.today")
                : t("home.value.age", { days: age })}
          </span>
        </span>
        <span className={shell.amountCol}>
          <Amount value={line.contribution} />
          <br />
          <span className={shell.muted}>{formatShare(line.contribution, value.assets)}</span>
        </span>
      </>
    );
  };
  const notices = data.notices.filter((n) => isMessageKey(n.message_key));
  const split = classifyAccounts(explanation.accounts, data.accounts, space.base_currency);
  const kpiFacts = profileFacts({
    total: value.total,
    liquid: split.liquid,
    risk: split.risk,
    monthlyExpense: data.monthlyExpense,
  }).value;
  const change = changeSinceLastClose(data.history, value.total, calendarDate(data.today));
  const evolution: ChartSeries[] =
    data.history.length >= 2
      ? [
          {
            key: "total",
            label: t("home.evolution.series"),
            tone: "main",
            points: data.history.map((p) => ({ date: p.date, y: Number(p.total.minor) / 100 })),
          },
        ]
      : [];
  const coverage =
    kpiFacts.liquidityMonthsTenths === null
      ? null
      : (Number(kpiFacts.liquidityMonthsTenths) / 10).toFixed(1).replace(".", ",");
  return (
    <main id="contenido" className={[styles.main, styles.wide].join(" ")}>
      <h1 className={styles.title}>{space.name}</h1>

      <div className={shell.dash}>
        <div className={shell.col}>
          <section aria-labelledby="patrimonio" className={shell.hero}>
            <h2 id="patrimonio" className={shell.heroLabel}>
              {t("home.total")}
            </h2>
            <p className={shell.total}>
              <Amount value={value.total} />
            </p>
            {change ? (
              <p className={shell.heroDelta}>
                <Amount value={change.delta} signed />
                {change.bps === null
                  ? ""
                  : ` · ${formatPercentSigned(dec(change.bps).div(10000))}`}{" "}
                {t("home.change.since", { date: fmtShort(change.since) })}
              </p>
            ) : null}
            <div className={shell.heroSplit}>
              <p>
                <span>{t("home.assets")}</span>
                <Amount value={value.assets} />
              </p>
              <p>
                <span>{t("home.liabilities")}</span>
                <Amount value={value.liabilities} />
              </p>
            </div>
          </section>
          {explanation.quality.excluded.length > 0 ? (
            <p className={shell.warn} role="note">
              {t("home.partial", { count: String(explanation.quality.excluded.length) })}
            </p>
          ) : null}

          <div className={shell.kpis}>
            <div className={shell.kpi}>
              <p className={shell.kpiLabel}>{t("home.kpi.liquid")}</p>
              <p className={shell.kpiValue}>
                <Amount value={split.liquid} />
              </p>
              <p className={shell.kpiHint}>{formatShare(split.liquid, value.total)}</p>
            </div>
            <div className={shell.kpi}>
              <p className={shell.kpiLabel}>{t("home.kpi.invested")}</p>
              <p className={shell.kpiValue}>
                <Amount value={split.risk} />
              </p>
              <p className={shell.kpiHint}>{formatShare(split.risk, value.total)}</p>
            </div>
            <div className={shell.kpi}>
              <p className={shell.kpiLabel}>{t("home.kpi.coverage")}</p>
              <p className={shell.kpiValue}>
                {coverage === null ? "—" : t("home.kpi.coverage_value", { months: coverage })}
              </p>
              <p className={shell.kpiHint}>
                {coverage === null ? t("home.kpi.coverage_none") : t("home.kpi.coverage_hint")}
              </p>
            </div>
          </div>

          {evolution.length > 0 ? (
            <section className={shell.panel} aria-labelledby="evolucion">
              <h2 id="evolucion" className={shell.panelTitle}>
                {t("home.evolution.title")}
              </h2>
              <div className="amount-chart">
                <LineChart
                  series={evolution}
                  label={t("home.evolution.title")}
                  format={(y) =>
                    formatMoney(money(BigInt(Math.round(y * 100)), space.base_currency))
                  }
                />
              </div>
              <p className="privacy-note">{t("home.evolution.private")}</p>
              <p className={shell.muted}>{t("home.evolution.note")}</p>
            </section>
          ) : null}

          <section className={shell.panel} aria-labelledby="cuentas">
            <h2 id="cuentas" className={shell.panelTitle}>
              {t("home.accounts")}
            </h2>
            <p className={shell.muted}>{t("home.accounts.share_hint")}</p>
            <ul className={shell.list}>
              {groups.map((group) =>
                group.lines.length === 1 ? (
                  <li key={group.lines[0]?.accountId} className={shell.item}>
                    {group.lines[0] ? renderLine(group.lines[0]) : null}
                  </li>
                ) : (
                  <li key={group.institutionId ?? group.name} className={shell.group}>
                    <details>
                      <summary className={shell.groupSummary}>
                        <span>
                          {group.name}
                          <br />
                          <span className={shell.muted}>
                            {t("home.group.count", { count: String(group.lines.length) })}
                          </span>
                        </span>
                        <span className={shell.amountCol}>
                          <Amount value={group.total} />
                          <br />
                          <span className={shell.muted}>
                            {formatShare(group.total, value.assets)}
                          </span>
                        </span>
                      </summary>
                      <ul className={shell.sublist}>
                        {group.lines.map((line) => (
                          <li key={line.accountId} className={shell.subitem}>
                            {renderLine(line)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ),
              )}
            </ul>
            <p className={styles.links}>
              <Link className={styles.primary} href={`/s/${spaceId}/valores`}>
                {t("values.link")}
              </Link>
              <Link className={styles.secondary} href={`/s/${spaceId}/movimientos/nuevo`}>
                {t("movement.new.link")}
              </Link>
              <Link className={styles.secondary} href={newAccount}>
                {t("home.add_account")}
              </Link>
              {review && review.anomalies.length > 0 ? (
                <Link className={styles.secondary} href={`/s/${spaceId}/revisar`}>
                  {t("review.link")} ·{" "}
                  {t("review.badge", { count: String(review.anomalies.length) })}
                </Link>
              ) : null}
            </p>
          </section>

          {value.byPocket.length > 0 ? (
            <section className={shell.panel} aria-labelledby="bolsillos">
              <h2 id="bolsillos" className={shell.panelTitle}>
                {t("home.by_pocket")}
              </h2>
              <ul className={shell.list}>
                {value.byPocket.map((pocket) => (
                  <li key={pocket.pocketId} className={shell.item}>
                    <span>{data.pockets.get(pocket.pocketId) ?? ""}</span>
                    <span className={shell.amountCol}>
                      <Amount value={pocket.value} />
                      <br />
                      <span className={shell.muted}>{formatShare(pocket.value, value.total)}</span>
                    </span>
                  </li>
                ))}
                <li className={shell.item}>
                  <span>{t("home.unassigned")}</span>
                  <span className={shell.amountCol}>
                    <Amount value={value.unassigned} />
                    <br />
                    <span className={shell.muted}>
                      {formatShare(value.unassigned, value.total)}
                    </span>
                  </span>
                </li>
              </ul>
            </section>
          ) : null}
        </div>

        <div className={shell.col}>
          <section className={shell.panel} aria-labelledby="avisos">
            <h2 id="avisos" className={shell.panelTitle}>
              {t("home.notices")}
            </h2>
            {notices.length === 0 && data.findings.length === 0 ? (
              <p className={shell.muted}>{t("home.notices.none")}</p>
            ) : (
              <ul className={shell.list}>
                {data.findings.map((finding) => (
                  <li key={finding.messageKey} className={shell.notice}>
                    <p>{t(finding.messageKey, adviceParams(finding, space.base_currency))}</p>
                    <details>
                      <summary>{t("advice.why.summary")}</summary>
                      <p>{t("advice.why.body")}</p>
                      <p className={shell.muted}>
                        {t(`advice.why.confidence_${finding.confidence}`)}
                      </p>
                    </details>
                  </li>
                ))}
                {notices.map((notice) => (
                  <li key={notice.id} className={shell.item}>
                    {t(notice.message_key, noticeParams(notice))}
                  </li>
                ))}
              </ul>
            )}
            <p className={shell.muted}>{t("advice.limits")}</p>
            <p className={styles.links}>
              <Link className={styles.secondary} href={`/s/${spaceId}/supuestos`}>
                {data.monthlyExpense ? t("assumptions.title") : t("advice.expense_cta")}
              </Link>
            </p>
          </section>

          {charts.byKind.length > 0 ? (
            <section className={shell.panel} aria-labelledby="graficos">
              <h2 id="graficos" className={shell.panelTitle}>
                {t("home.charts.title")}
              </h2>
              <p className={shell.muted}>{t("home.charts.note")}</p>
              <h3 className={shell.muted}>{t("home.charts.by_kind")}</h3>
              <DonutChart slices={charts.byKind} label={t("home.charts.by_kind")} />
              <h3 className={shell.muted}>{t("home.charts.by_institution")}</h3>
              <DonutChart slices={charts.byInstitution} label={t("home.charts.by_institution")} />
              {charts.byPocket.length > 0 ? (
                <>
                  <h3 className={shell.muted}>{t("home.charts.by_pocket")}</h3>
                  <DonutChart slices={charts.byPocket} label={t("home.charts.by_pocket")} />
                </>
              ) : null}
            </section>
          ) : null}

          <section className={shell.panel} aria-labelledby="rentabilidad">
            <h2 id="rentabilidad" className={shell.panelTitle}>
              {t("returns.title")}
            </h2>
            {data.returns.accounts.length === 0 ? (
              <p className={shell.muted}>{t("returns.empty")}</p>
            ) : (
              <>
                <p className={shell.muted}>{t("returns.intro")}</p>
                <ul className={shell.list}>
                  {data.returns.accounts.map(({ accountId, result }) => (
                    <li key={accountId} className={shell.returnItem}>
                      {renderReturn(data.accounts.get(accountId)?.name ?? "", result)}
                    </li>
                  ))}
                  {data.returns.total ? (
                    <li className={shell.returnItem}>
                      {renderReturn(t("returns.total"), data.returns.total)}
                    </li>
                  ) : null}
                </ul>
                <p className={styles.links}>
                  <Link className={styles.secondary} href={`/s/${spaceId}/rentabilidad`}>
                    {t("perf.link")}
                  </Link>
                </p>
                <details className={shell.explain}>
                  <summary>{t("returns.explain.summary")}</summary>
                  <p>{t("returns.explain.body")}</p>
                  <ul>
                    {[
                      ...new Set(
                        [...data.returns.accounts.map((a) => a.result), data.returns.total].flatMap(
                          (r) => r?.explanation.caveats ?? [],
                        ),
                      ),
                    ].map((code) => (
                      <li key={code}>{t(code)}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </section>

          <section className={shell.panel} aria-labelledby="metodo">
            <h2 id="metodo" className={shell.panelTitle}>
              {t("home.explain.summary")}
            </h2>
            <details open className={shell.explain}>
              <summary>{t("home.explain.summary")}</summary>
              <p>
                {t("home.explain.method", {
                  currency: explanation.baseCurrency,
                  date: explanation.onDate,
                })}
              </p>
              <h3 className={shell.muted}>{t("home.explain.assumptions")}</h3>
              <ul>
                {explanation.assumptions.map((code) => (
                  <li key={code}>{t(code)}</li>
                ))}
              </ul>
              {explanation.quality.excluded.length > 0 ? (
                <ul>
                  {explanation.quality.excluded.map((item) => (
                    <li key={item.accountId}>
                      {t("home.explain.excluded", {
                        name: data.accounts.get(item.accountId)?.name ?? "",
                        reason: t(item.code),
                      })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
          </section>
        </div>
      </div>
    </main>
  );
}

type HomeData = NonNullable<Awaited<ReturnType<typeof loadHome>>>;

/** Composición de lo que se tiene, a partir del mismo cálculo que muestra el patrimonio. */
function buildCharts(data: HomeData) {
  const options = { max: 6, otherLabel: t("home.charts.other") };
  const kinds = new Map<string, SliceInput>();
  for (const line of data.result.explanation.accounts) {
    const meta = data.accounts.get(line.accountId);
    if (!meta) continue;
    const previous = kinds.get(meta.kind);
    kinds.set(meta.kind, {
      key: meta.kind,
      label: t(`account.kind.${meta.kind}`),
      value: previous
        ? { ...previous.value, minor: previous.value.minor + line.contribution.minor }
        : line.contribution,
    });
  }
  const { byPocket, unassigned } = data.result.value;
  const pockets: SliceInput[] = byPocket.map((p) => ({
    key: p.pocketId,
    label: data.pockets.get(p.pocketId) ?? "",
    value: p.value,
  }));
  pockets.push({ key: "unassigned", label: t("home.unassigned"), value: unassigned });
  return {
    byKind: buildSlices([...kinds.values()], options),
    byInstitution: buildSlices(
      groupAccounts(data.result.explanation.accounts, data.accounts, data.institutions).map(
        (g) => ({
          key: g.institutionId ?? g.lines[0]?.accountId ?? g.name,
          label: g.name,
          value: g.total,
        }),
      ),
      options,
    ),
    byPocket: byPocket.length > 0 ? buildSlices(pockets, options) : [],
  };
}

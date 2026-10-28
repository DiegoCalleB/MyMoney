import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { DonutChart } from "@/components/donut-chart";
import { isMessageKey, t } from "@/lib/i18n";
import { buildSlices, type SliceInput } from "@/server/chart-model";
import { requireReadyUser } from "@/server/auth";
import { loadHome } from "@/server/queries/home";
import { noticeParams } from "@/server/home-model";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("home.title") };

export default async function HomePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const spaceId = parsed.data;

  const { supabase } = await requireReadyUser();
  const data = await loadHome(supabase, spaceId);
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
  const notices = data.notices.filter((n) => isMessageKey(n.message_key));
  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{space.name}</h1>

      <section aria-labelledby="patrimonio">
        <h2 id="patrimonio" className={shell.muted}>
          {t("home.total")}
        </h2>
        <p className={shell.total}>
          <Amount value={value.total} />
        </p>
        <div className={shell.grid}>
          <div className={shell.card}>
            <p className={shell.muted}>{t("home.assets")}</p>
            <p>
              <Amount value={value.assets} />
            </p>
          </div>
          <div className={shell.card}>
            <p className={shell.muted}>{t("home.liabilities")}</p>
            <p>
              <Amount value={value.liabilities} />
            </p>
          </div>
        </div>

        {explanation.quality.excluded.length > 0 ? (
          <p className={shell.warn} role="note">
            {t("home.partial", { count: String(explanation.quality.excluded.length) })}
          </p>
        ) : null}

        <details className={shell.explain}>
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

      {charts.byKind.length > 0 ? (
        <section className={styles.section} aria-labelledby="graficos">
          <h2 id="graficos" className={styles.heading2}>
            {t("home.charts.title")}
          </h2>
          <p className={shell.muted}>{t("home.charts.note")}</p>
          <h3 className={shell.muted}>{t("home.charts.by_kind")}</h3>
          <DonutChart slices={charts.byKind} label={t("home.charts.by_kind")} />
          <h3 className={shell.muted}>{t("home.charts.by_account")}</h3>
          <DonutChart slices={charts.byAccount} label={t("home.charts.by_account")} />
          {charts.byPocket.length > 0 ? (
            <>
              <h3 className={shell.muted}>{t("home.charts.by_pocket")}</h3>
              <DonutChart slices={charts.byPocket} label={t("home.charts.by_pocket")} />
            </>
          ) : null}
        </section>
      ) : null}

      {value.byPocket.length > 0 ? (
        <section className={styles.section} aria-labelledby="bolsillos">
          <h2 id="bolsillos" className={styles.heading2}>
            {t("home.by_pocket")}
          </h2>
          <ul className={shell.list}>
            {value.byPocket.map((pocket) => (
              <li key={pocket.pocketId} className={shell.item}>
                <span>{data.pockets.get(pocket.pocketId) ?? ""}</span>
                <span>
                  <Amount value={pocket.value} />
                </span>
              </li>
            ))}
            <li className={shell.item}>
              <span>{t("home.unassigned")}</span>
              <span>
                <Amount value={value.unassigned} />
              </span>
            </li>
          </ul>
        </section>
      ) : null}

      <section className={styles.section} aria-labelledby="cuentas">
        <h2 id="cuentas" className={styles.heading2}>
          {t("home.accounts")}
        </h2>
        <ul className={shell.list}>
          {explanation.accounts.map((line) => {
            const meta = data.accounts.get(line.accountId);
            const age = String(line.ageDays);
            return (
              <li key={line.accountId} className={shell.item}>
                <span>
                  {meta?.name}
                  <br />
                  <span className={shell.muted}>
                    {meta ? t(`account.kind.${meta.kind}`) : ""} ·{" "}
                    {line.stale
                      ? t("home.value.stale", { days: age })
                      : line.ageDays === 0
                        ? t("home.value.today")
                        : t("home.value.age", { days: age })}
                  </span>
                </span>
                <span>
                  <Amount value={line.contribution} />
                </span>
              </li>
            );
          })}
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
        </p>
      </section>

      <section className={styles.section} aria-labelledby="avisos">
        <h2 id="avisos" className={styles.heading2}>
          {t("home.notices")}
        </h2>
        {notices.length === 0 ? (
          <p className={shell.muted}>{t("home.notices.none")}</p>
        ) : (
          <ul className={shell.list}>
            {notices.map((notice) => (
              <li key={notice.id} className={shell.item}>
                {t(notice.message_key, noticeParams(notice))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

type HomeData = NonNullable<Awaited<ReturnType<typeof loadHome>>>;

/** Composición de lo que se tiene, a partir del mismo cálculo que muestra el patrimonio. */
function buildCharts(data: HomeData) {
  const options = { max: 6, otherLabel: t("home.charts.other") };
  const kinds = new Map<string, SliceInput>();
  const accounts: SliceInput[] = [];
  for (const line of data.result.explanation.accounts) {
    const meta = data.accounts.get(line.accountId);
    if (!meta) continue;
    accounts.push({ key: line.accountId, label: meta.name, value: line.contribution });
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
    byAccount: buildSlices(accounts, options),
    byPocket: byPocket.length > 0 ? buildSlices(pockets, options) : [],
  };
}

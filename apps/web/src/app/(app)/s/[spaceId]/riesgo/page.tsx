import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { formatPercent, formatShare } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadRisk } from "@/server/queries/risk";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("risk.title") };

export default async function RiskPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const spaceId = parsed.data;

  const { supabase } = await requireReadyUser();
  const data = await loadRisk(supabase, spaceId);
  if (!data) notFound();
  const { model } = data;
  const exposure = model.exposure;
  const hasValue = exposure !== null && exposure.value.total.minor > 0n;

  const assumptions = [
    ...new Set([
      ...(exposure?.explanation.assumptions ?? []),
      ...model.scenarios.flatMap((s) => s.result?.explanation.assumptions ?? []),
    ]),
  ];
  const notes = exposure?.explanation.quality.notes ?? [];

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("risk.title")}</h1>
      <p className={styles.lead}>{t("risk.lead")}</p>

      {exposure === null ? <p className={shell.warn}>{t("risk.unavailable")}</p> : null}
      {exposure !== null && !hasValue ? <p className={shell.muted}>{t("risk.empty")}</p> : null}

      {exposure !== null && hasValue ? (
        <>
          <section className={styles.section} aria-labelledby="composicion">
            <h2 id="composicion" className={styles.heading2}>
              {t("risk.composition.title")}
            </h2>
            <ul className={shell.list}>
              {exposure.value.byClass.map((c) => (
                <li key={c.key} className={shell.item}>
                  <span>
                    {t(`asset_class.${c.key}`)}
                    <br />
                    <span className={shell.muted}>{formatShare(c.shareBps)}</span>
                  </span>
                  <span>
                    <Amount value={c.value} />
                  </span>
                </li>
              ))}
            </ul>
            {exposure.explanation.quality.level === "low" ? (
              <p className={shell.warn} role="note">
                {t("risk.composition.low_quality")}
              </p>
            ) : null}
            {model.editable.length > 0 ? (
              <>
                <h3 className={shell.muted}>{t("risk.composition.adjust_list")}</h3>
                <ul className={shell.list}>
                  {model.editable.map((id) => (
                    <li key={id} className={shell.item}>
                      <span>{model.names.get(id)}</span>
                      <Link className={styles.secondary} href={`/s/${spaceId}/riesgo/${id}`}>
                        {t("risk.composition.adjust")}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className={styles.section} aria-labelledby="concentracion">
            <h2 id="concentracion" className={styles.heading2}>
              {t("risk.concentration.title")}
            </h2>
            <ul>
              {model.byAccount.top ? (
                <li>
                  {t("risk.concentration.account", {
                    name: model.names.get(model.byAccount.top.key) ?? "",
                    share: formatShare(model.byAccount.top.shareBps),
                  })}
                </li>
              ) : null}
              {model.byClass.top ? (
                <li>
                  {t("risk.concentration.class", {
                    name: t(`asset_class.${model.byClass.top.key}`),
                    share: formatShare(model.byClass.top.shareBps),
                  })}
                </li>
              ) : null}
              {model.byAccount.effectiveCount ? (
                <li>
                  {t("risk.concentration.effective", {
                    count: model.byAccount.effectiveCount.toFixed(1),
                  })}
                </li>
              ) : null}
            </ul>
            {model.speculative.value.minor > 0n ? (
              <>
                <h3 className={shell.muted}>{t("risk.speculative.title")}</h3>
                <p>
                  {t("risk.speculative.body", { share: formatShare(model.speculative.shareBps) })}{" "}
                  <Amount value={model.speculative.value} />
                </p>
              </>
            ) : null}
          </section>

          <section className={styles.section} aria-labelledby="escenarios">
            <h2 id="escenarios" className={styles.heading2}>
              {t("risk.scenarios.title")}
            </h2>
            <p className={shell.muted}>{t("risk.scenarios.note")}</p>
            {model.scenarios.map((scenario) => {
              const result = scenario.result;
              if (!result) return null;
              const loss = result.value.total;
              const lossBps = Number(
                (-loss.minor * 10_000n * 2n + exposure.value.total.minor) /
                  (exposure.value.total.minor * 2n),
              );
              return (
                <div key={scenario.id} className={shell.card}>
                  <h3>{t(`risk.scenario.${scenario.id}`)}</h3>
                  <p className={shell.muted}>
                    {Object.entries(scenario.shocks)
                      .map(([key, shock]) =>
                        t("risk.scenario.shock", {
                          name: t(`asset_class.${key}`),
                          value: formatPercent(shock),
                        }),
                      )
                      .join(" · ")}
                  </p>
                  <p className={shell.total}>
                    <Amount value={loss} />
                  </p>
                  <p>{t("risk.scenario.impact", { share: formatShare(lossBps) })}</p>
                  <p className={shell.muted}>
                    {t("risk.scenario.after")} <Amount value={result.value.valueAfter} />
                  </p>
                  <p className={shell.muted}>
                    {result.value.monthsOfSpending
                      ? t("risk.scenario.months", {
                          months: result.value.monthsOfSpending.toFixed(1),
                        })
                      : t("risk.scenario.no_spending")}
                  </p>
                  <details className={shell.explain}>
                    <summary>{t("risk.scenario.by_account")}</summary>
                    <ul className={shell.list}>
                      {result.value.byHolding
                        .filter((h) => h.impact.minor !== 0n)
                        .map((h) => (
                          <li key={h.id} className={shell.item}>
                            <span>{model.names.get(h.id)}</span>
                            <span>
                              <Amount value={h.impact} />
                            </span>
                          </li>
                        ))}
                    </ul>
                  </details>
                </div>
              );
            })}
          </section>

          <details className={shell.explain}>
            <summary>{t("risk.explain.summary")}</summary>
            <ul>
              {assumptions.map((code) => (
                <li key={code}>{t(code)}</li>
              ))}
            </ul>
            {notes.length > 0 ? (
              <>
                <h4 className={shell.muted}>{t("risk.explain.notes")}</h4>
                <ul>
                  {notes.map((note) => (
                    <li key={`${note.code}-${note.holdingId ?? ""}`}>
                      {t(note.code, { name: model.names.get(note.holdingId ?? "") ?? "" })}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </details>
        </>
      ) : null}

      <p className={styles.links}>
        <Link className={styles.secondary} href={`/s/${spaceId}/inicio`}>
          {t("nav.home")}
        </Link>
      </p>
    </main>
  );
}

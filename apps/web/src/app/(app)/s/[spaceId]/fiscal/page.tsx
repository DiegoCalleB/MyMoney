import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import fieldStyles from "@/components/fields.module.css";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadTax } from "@/server/queries/tax";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("tax.title") };

const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" });
const percent = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 });

export default async function TaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ cuenta?: string; actual?: string; destino?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const query = await searchParams;

  const { supabase } = await requireReadyUser();
  const data = await loadTax(supabase, parsed.data, query);
  if (!data) notFound();
  const { space, pension, comparison } = data;

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("tax.title")}</h1>
      <p className={styles.lead}>{t("tax.intro")}</p>
      <p className={shell.muted}>{t("tax.disclaimer")}</p>

      <h2 className={styles.heading2}>
        {t("tax.pension.title", { year: String(data.fiscalYear) })}
      </h2>
      {!data.hasPensionAccounts ? (
        <p>{t("tax.pension.no_accounts")}</p>
      ) : pension === null ? (
        <p>{t("tax.missing_parameter", { year: String(data.fiscalYear) })}</p>
      ) : !pension.ok ? (
        <p role="status">{t("tax.error.generic")}</p>
      ) : (
        <>
          <dl className={shell.returnGrid}>
            <div>
              <dt className={shell.muted}>{t("tax.pension.limit")}</dt>
              <dd>
                <Amount value={pension.value.value.limit} />
              </dd>
            </div>
            <div>
              <dt className={shell.muted}>{t("tax.pension.contributed")}</dt>
              <dd>
                <Amount value={pension.value.value.contributed} />
                {pension.value.value.fractionUsed
                  ? ` · ${percent.format(pension.value.value.fractionUsed.toNumber())}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt className={shell.muted}>{t("tax.pension.remaining")}</dt>
              <dd>
                <Amount value={pension.value.value.remaining} />
              </dd>
            </div>
            {pension.value.value.excess.minor > 0n ? (
              <div>
                <dt className={shell.muted}>{t("tax.pension.excess")}</dt>
                <dd>
                  <Amount value={pension.value.value.excess} />
                </dd>
              </div>
            ) : null}
          </dl>
          <details className={shell.explain}>
            <summary>{t("tax.explain.summary")}</summary>
            <p>
              {t("tax.source", {
                year: String(pension.value.explanation.source.fiscalYear),
                date: dateFormat.format(new Date(pension.value.explanation.source.verifiedOn)),
              })}{" "}
              <a href={pension.value.explanation.source.sourceUrl} rel="noreferrer noopener">
                {t("tax.source.link")}
              </a>
            </p>
            <ul>
              {pension.value.explanation.caveats.map((code) => (
                <li key={code}>{t(code)}</li>
              ))}
            </ul>
          </details>
        </>
      )}

      <h2 className={styles.heading2}>{t("tax.compare.title")}</h2>
      <p>{t("tax.compare.intro")}</p>
      {data.funds.length === 0 ? (
        <p>{t("tax.compare.no_funds")}</p>
      ) : !data.scaleAvailable ? (
        <p>{t("tax.missing_parameter", { year: String(data.fiscalYear) })}</p>
      ) : (
        <>
          <form method="get" className={fieldStyles.form}>
            <div className={fieldStyles.field}>
              <label className={fieldStyles.label} htmlFor="cuenta">
                {t("tax.compare.account")}
              </label>
              <select
                className={fieldStyles.input}
                id="cuenta"
                name="cuenta"
                defaultValue={data.selectedFund ?? undefined}
              >
                {data.funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={fieldStyles.field}>
              <label className={fieldStyles.label} htmlFor="actual">
                {t("tax.compare.current_ter")}
              </label>
              <p className={fieldStyles.hint} id="actual-hint">
                {t("tax.compare.ter_hint")}
              </p>
              <input
                className={fieldStyles.input}
                id="actual"
                name="actual"
                inputMode="decimal"
                autoComplete="off"
                maxLength={5}
                defaultValue={data.inputs.currentTer}
                aria-describedby="actual-hint"
                required
              />
            </div>
            <div className={fieldStyles.field}>
              <label className={fieldStyles.label} htmlFor="destino">
                {t("tax.compare.target_ter")}
              </label>
              <input
                className={fieldStyles.input}
                id="destino"
                name="destino"
                inputMode="decimal"
                autoComplete="off"
                maxLength={5}
                defaultValue={data.inputs.targetTer}
                aria-describedby="actual-hint"
                required
              />
            </div>
            <button className={fieldStyles.submit} type="submit">
              {t("tax.compare.submit")}
            </button>
          </form>

          {comparison === null ? null : !comparison.ok ? (
            <p role="status">{t(`${comparison.error.code}.message`)}</p>
          ) : (
            <>
              <table>
                <caption className={shell.muted}>{t("tax.compare.caption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("tax.compare.col.item")}</th>
                    <th scope="col">{t("tax.compare.col.transfer")}</th>
                    <th scope="col">{t("tax.compare.col.sale")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">{t("tax.compare.row.tax_now")}</th>
                    <td>
                      <Amount value={comparison.value.value.transfer.taxNow} />
                    </td>
                    <td>
                      <Amount value={comparison.value.value.sale.taxNow} />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("tax.compare.row.invested")}</th>
                    <td>
                      <Amount value={comparison.value.value.transfer.invested} />
                    </td>
                    <td>
                      <Amount value={comparison.value.value.sale.invested} />
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">{t("tax.compare.row.saving")}</th>
                    <td>
                      <Amount value={comparison.value.value.transfer.annualFeeSaving} signed />
                    </td>
                    <td>
                      <Amount value={comparison.value.value.sale.annualFeeSaving} signed />
                    </td>
                  </tr>
                </tbody>
              </table>
              <p>
                {comparison.value.value.saleBreakEvenYears
                  ? t("tax.compare.break_even", {
                      years: comparison.value.value.saleBreakEvenYears.toFixed(1).replace(".", ","),
                    })
                  : t("tax.compare.no_break_even")}
              </p>
              <p className={shell.muted}>{t("tax.compare.estimate_label")}</p>
              <details className={shell.explain}>
                <summary>{t("tax.explain.summary")}</summary>
                <p>
                  {t("tax.source", {
                    year: String(comparison.value.explanation.source.fiscalYear),
                    date: dateFormat.format(
                      new Date(comparison.value.explanation.source.verifiedOn),
                    ),
                  })}{" "}
                  <a href={comparison.value.explanation.source.sourceUrl} rel="noreferrer noopener">
                    {t("tax.source.link")}
                  </a>
                </p>
                <p>{t("tax.assumptions.title")}</p>
                <ul>
                  {comparison.value.explanation.assumptions.map((code) => (
                    <li key={code}>{t(code)}</li>
                  ))}
                </ul>
                <ul>
                  {comparison.value.explanation.caveats.map((code) => (
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

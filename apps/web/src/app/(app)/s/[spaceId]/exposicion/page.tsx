import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { EXPOSURE_DIMENSIONS, isDimension } from "@/server/exposure-model";
import { loadExposure } from "@/server/queries/exposure";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("exposure.title") };

const percent = new Intl.NumberFormat("es-ES", { style: "percent", maximumFractionDigits: 1 });

export default async function ExposurePage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ dimension?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const query = await searchParams;
  const dimension = isDimension(query.dimension) ? query.dimension : "asset_class";

  const { supabase } = await requireReadyUser();
  const data = await loadExposure(supabase, parsed.data, dimension);
  if (!data) notFound();
  const { space, model } = data;
  const result = model.result;

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("exposure.title")}</h1>
      <p className={styles.lead}>{t("exposure.intro")}</p>
      <nav aria-label={t("exposure.dimensions")}>
        <ul className={shell.chips}>
          {EXPOSURE_DIMENSIONS.map((d) => (
            <li key={d}>
              <Link
                href={`/s/${space.id}/exposicion?dimension=${d}`}
                className={shell.chip}
                aria-current={d === dimension ? "page" : undefined}
              >
                {t(`exposure.dimension.${d}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!result.ok ? (
        <p role="status">{t("exposure.error")}</p>
      ) : result.value.value.total.minor === 0n ? (
        <p>{t("exposure.empty")}</p>
      ) : (
        <>
          <table>
            <caption className={shell.muted}>
              {t("exposure.caption", { dimension: t(`exposure.dimension.${dimension}`) })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("exposure.col.key")}</th>
                <th scope="col">{t("exposure.col.amount")}</th>
                <th scope="col">{t("exposure.col.share")}</th>
              </tr>
            </thead>
            <tbody>
              {result.value.value.buckets.map((b) => (
                <tr key={b.key}>
                  <th scope="row">{b.key}</th>
                  <td>
                    <Amount value={b.amount} />
                  </td>
                  <td>{percent.format(b.share.toNumber())}</td>
                </tr>
              ))}
              {result.value.value.unclassified.minor > 0n ? (
                <tr>
                  <th scope="row">{t("exposure.unclassified")}</th>
                  <td>
                    <Amount value={result.value.value.unclassified} />
                  </td>
                  <td>
                    {percent.format(
                      result.value.value.total.minor === 0n
                        ? 0
                        : Number(
                            (result.value.value.unclassified.minor * 10000n) /
                              result.value.value.total.minor,
                          ) / 10000,
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <details className={shell.explain}>
            <summary>{t("exposure.explain.summary")}</summary>
            <p>{t("exposure.explain.body")}</p>
            <ul>
              {result.value.explanation.caveats.map((code) => (
                <li key={code}>{t(code)}</li>
              ))}
            </ul>
          </details>
        </>
      )}

      {model.undeclared.length > 0 ? (
        <section aria-labelledby="sin-declarar">
          <h2 id="sin-declarar" className={styles.heading2}>
            {t("exposure.undeclared.title")}
          </h2>
          <ul>
            {model.undeclared.map((a) => (
              <li key={a.id}>
                <Link href={`/s/${space.id}/exposicion/${a.id}?dimension=${dimension}`}>
                  {t("exposure.undeclared.link", { name: a.name })}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className={styles.links}>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

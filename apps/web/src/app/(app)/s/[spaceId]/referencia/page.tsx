import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import { formatPercentSigned } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadBenchmark } from "@/server/queries/benchmark";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("benchmark.title") };

export default async function BenchmarkPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ cuenta?: string; instrumento?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const query = await searchParams;

  const { supabase } = await requireReadyUser();
  const data = await loadBenchmark(supabase, parsed.data, query.cuenta, query.instrumento);
  if (!data) notFound();
  const { space, accounts, instruments, selectedAccount, selectedInstrument, result } = data;
  const link = (account: string, instrument: string) =>
    `/s/${space.id}/referencia?cuenta=${encodeURIComponent(account)}&instrumento=${encodeURIComponent(instrument)}`;

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("benchmark.title")}</h1>
      <p className={styles.lead}>{t("benchmark.intro")}</p>
      {accounts.length === 0 ? (
        <p>{t("benchmark.no_accounts")}</p>
      ) : instruments.length === 0 || !selectedAccount || !selectedInstrument ? (
        <p>{t("benchmark.no_prices")}</p>
      ) : (
        <>
          <nav aria-label={t("benchmark.accounts")}>
            <ul className={shell.chips}>
              {accounts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={link(a.id, selectedInstrument)}
                    className={shell.chip}
                    aria-current={a.id === selectedAccount ? "page" : undefined}
                  >
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t("benchmark.instruments")}>
            <ul className={shell.chips}>
              {instruments.map((i) => (
                <li key={i}>
                  <Link
                    href={link(selectedAccount, i)}
                    className={shell.chip}
                    aria-current={i === selectedInstrument ? "page" : undefined}
                  >
                    {i}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {result === null ? null : !result.ok ? (
            <p role="status">{t(`${result.error.code}.message`, result.error.params ?? {})}</p>
          ) : (
            <>
              <dl className={shell.returnGrid}>
                <div>
                  <dt className={shell.muted}>{t("benchmark.contributed")}</dt>
                  <dd>
                    <Amount value={result.value.value.contributed} />
                  </dd>
                </div>
                <div>
                  <dt className={shell.muted}>{t("benchmark.portfolio")}</dt>
                  <dd>
                    <Amount value={result.value.value.portfolioGain} signed />
                    {result.value.value.portfolioReturn
                      ? ` · ${formatPercentSigned(result.value.value.portfolioReturn)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className={shell.muted}>
                    {t("benchmark.reference", { name: selectedInstrument })}
                  </dt>
                  <dd>
                    <Amount value={result.value.value.benchmarkGain} signed />
                    {result.value.value.benchmarkReturn
                      ? ` · ${formatPercentSigned(result.value.value.benchmarkReturn)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt className={shell.muted}>{t("benchmark.difference")}</dt>
                  <dd>
                    <Amount value={result.value.value.difference} signed />
                  </dd>
                </div>
              </dl>
              <p className={shell.muted}>{t("benchmark.history_note")}</p>
              <details className={shell.explain}>
                <summary>{t("benchmark.explain.summary")}</summary>
                <p>{t("benchmark.explain.body")}</p>
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

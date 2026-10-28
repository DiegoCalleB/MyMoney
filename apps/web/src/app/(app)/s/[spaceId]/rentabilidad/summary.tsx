import type { Decimal } from "@mymoney/finance-core";
import { Amount } from "@/components/amount";
import { formatPercent } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Attempt, ReturnsSummary } from "@/server/returns-model";
import shell from "../../../shell.module.css";

function Rate({
  rate,
  annualized,
  reliable,
}: {
  readonly rate: Decimal;
  readonly annualized: Decimal;
  readonly reliable: boolean;
}) {
  return reliable ? (
    <>
      <p className={shell.total}>{t("returns.annualized", { value: formatPercent(annualized) })}</p>
      <p className={shell.muted}>{t("returns.cumulative", { value: formatPercent(rate) })}</p>
    </>
  ) : (
    <>
      <p className={shell.total}>{t("returns.cumulative", { value: formatPercent(rate) })}</p>
      <p className={shell.muted}>{t("returns.short_period")}</p>
    </>
  );
}

function Unavailable({ code }: { readonly code: string }) {
  return <p className={shell.muted}>{t("returns.unavailable", { reason: t(code) })}</p>;
}

function Card({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={shell.card}>
      <h3 className={shell.muted}>{title}</h3>
      {children}
      {hint ? <p className={shell.muted}>{hint}</p> : null}
    </div>
  );
}

const assumptionsOf = (
  attempts: readonly Attempt<{ explanation: { assumptions: readonly string[] } }>[],
) => [...new Set(attempts.flatMap((a) => (a.ok ? a.result.explanation.assumptions : [])))];

/** Todas las cifras de rentabilidad de una cuenta o del conjunto, con su explicación. */
export function SummaryView({ summary }: { readonly summary: ReturnsSummary }) {
  const { gain, xirr, twr, real } = summary;
  const assumptions = assumptionsOf([gain, xirr, twr, real]);
  const extraNotes = [
    ...summary.notes,
    ...[xirr, twr, real].flatMap((a) => (a.ok ? a.result.explanation.quality.notes : [])),
  ];
  return (
    <>
      <p className={shell.muted}>
        {t("returns.period", { from: summary.from, to: summary.to, currency: summary.currency })}
      </p>
      <div className={shell.grid}>
        <Card title={t("returns.gain.title")}>
          {gain.ok ? (
            <dl>
              {gain.result.value.opening.minor !== 0n ? (
                <>
                  <dt className={shell.muted}>{t("returns.gain.opening")}</dt>
                  <dd>
                    <Amount value={gain.result.value.opening} />
                  </dd>
                </>
              ) : null}
              <dt className={shell.muted}>{t("returns.gain.contributed")}</dt>
              <dd>
                <Amount value={gain.result.value.contributed} />
              </dd>
              {gain.result.value.withdrawn.minor !== 0n ? (
                <>
                  <dt className={shell.muted}>{t("returns.gain.withdrawn")}</dt>
                  <dd>
                    <Amount value={gain.result.value.withdrawn} />
                  </dd>
                </>
              ) : null}
              <dt className={shell.muted}>{t("returns.gain.end")}</dt>
              <dd>
                <Amount value={gain.result.value.endValue} />
              </dd>
              <dt className={shell.muted}>{t("returns.gain.gain")}</dt>
              <dd>
                <strong>
                  <Amount value={gain.result.value.gain} />
                </strong>
              </dd>
            </dl>
          ) : (
            <Unavailable code={gain.code} />
          )}
        </Card>
        <Card title={t("returns.twr.title")} hint={t("returns.twr.hint")}>
          {twr.ok ? (
            <Rate
              rate={twr.result.value.cumulative}
              annualized={twr.result.value.annualized}
              reliable={twr.result.value.annualizedReliable}
            />
          ) : (
            <Unavailable code={twr.code} />
          )}
        </Card>
        <Card title={t("returns.xirr.title")} hint={t("returns.xirr.hint")}>
          {xirr.ok ? (
            <Rate
              rate={xirr.result.value.cumulative}
              annualized={xirr.result.value.annualized}
              reliable={xirr.result.value.annualizedReliable}
            />
          ) : (
            <Unavailable code={xirr.code} />
          )}
        </Card>
        <Card title={t("returns.real.title")} hint={t("returns.real.hint")}>
          {real.ok ? (
            <>
              <Rate
                rate={real.result.value.cumulative.real}
                annualized={(real.result.value.annualized ?? real.result.value.cumulative).real}
                reliable={real.result.value.annualizedReliable}
              />
              <p className={shell.muted}>
                {t("returns.real.inflation", {
                  value: formatPercent(real.result.value.cumulative.inflation),
                })}
              </p>
              {real.basis === "xirr" ? (
                <p className={shell.muted}>{t("returns.real.basis_xirr")}</p>
              ) : null}
            </>
          ) : (
            <Unavailable code={real.code} />
          )}
        </Card>
      </div>
      <details className={shell.explain}>
        <summary>{t("returns.explain.summary")}</summary>
        {twr.ok ? <p>{t("returns.explain.method", { method: t("returns.method.twr") })}</p> : null}
        {xirr.ok ? (
          <p>{t("returns.explain.method", { method: t("returns.method.xirr") })}</p>
        ) : null}
        {assumptions.length > 0 ? (
          <>
            <h4 className={shell.muted}>{t("returns.explain.assumptions")}</h4>
            <ul>
              {assumptions.map((code) => (
                <li key={code}>{t(code)}</li>
              ))}
            </ul>
          </>
        ) : null}
        {extraNotes.length > 0 ? (
          <>
            <h4 className={shell.muted}>{t("returns.explain.notes")}</h4>
            <ul>
              {extraNotes.map((note, i) => (
                <li key={`${note.code}-${String(i)}`}>{t(note.code, note.params)}</li>
              ))}
            </ul>
          </>
        ) : null}
      </details>
    </>
  );
}

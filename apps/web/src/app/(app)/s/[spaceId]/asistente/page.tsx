import { investPathScenarios, parseLocalizedAmount, sub } from "@mymoney/finance-core";
import { pathSimulatorInput } from "@mymoney/schemas";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Amount } from "@/components/amount";
import fields from "@/components/fields.module.css";
import { readAssistantEnv } from "@/lib/env";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadAssistantFacts } from "@/server/queries/assistant";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";
import local from "./asistente.module.css";
import { AssistantChat } from "./chat";

export const metadata: Metadata = { title: t("assistant.title") };

const pct = (bps: number | null) =>
  bps === null ? "—" : `${(bps / 100).toFixed(1).replace(".", ",")} %`;

type Search = Record<string, string | undefined>;

export default async function AssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<Search>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const query = await searchParams;

  const { supabase } = await requireReadyUser();
  const data = await loadAssistantFacts(supabase, parsed.data);
  if (!data) notFound();
  const { space, source } = data;
  const { facts } = source;
  const enabled = readAssistantEnv() !== null;

  // Simulador: valores de la URL (o por defecto) y resultado solo si se pidió.
  const asked = query.amount !== undefined;
  const input = pathSimulatorInput.safeParse({
    amount: query.amount ?? "10000",
    months: query.months ?? "12",
    annualReturn: query.annualReturn ?? "7",
    drop: query.drop ?? "20",
  });
  const amount = input.success
    ? parseLocalizedAmount(input.data.amount, space.base_currency)
    : null;
  const simulation =
    asked && input.success && amount
      ? investPathScenarios({
          amount,
          months: input.data.months,
          annualReturnBps: Math.round(input.data.annualReturn * 100),
          dropBps: Math.round(input.data.drop * 100),
        })
      : null;
  const simError = asked
    ? !input.success || !amount
      ? "assistant.amount_invalid"
      : simulation && !simulation.ok
        ? simulation.error.code
        : null
    : null;

  const suggestions = [
    t("assistant.suggest.when"),
    t("assistant.suggest.before"),
    t("assistant.suggest.lump"),
    t("assistant.suggest.fall"),
    t("assistant.suggest.months"),
  ];
  const months =
    facts.liquidityMonthsTenths === null
      ? null
      : (Number(facts.liquidityMonthsTenths) / 10).toFixed(1).replace(".", ",");

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("assistant.title")}</h1>
      <p className={styles.lead}>{t("assistant.intro")}</p>
      <p className={shell.muted}>{t("assistant.disclaimer")}</p>

      <section aria-labelledby="facts-title" className={local.facts}>
        <h2 id="facts-title" className={local.h2}>
          {t("assistant.facts.title")}
        </h2>
        <p className={shell.muted}>{t("assistant.facts.intro")}</p>
        <dl className={shell.returnGrid}>
          <dt>{t("assistant.facts.net_worth")}</dt>
          <dd>
            <Amount value={source.total} />
          </dd>
          <dt>{t("assistant.facts.liquid")}</dt>
          <dd>
            <Amount value={source.liquid} />
          </dd>
          <dt>{t("assistant.facts.risk")}</dt>
          <dd>
            <Amount value={source.risk} />{" "}
            <span className={shell.muted}>
              ({t("assistant.facts.risk_share", { share: pct(facts.riskShareBps) })})
            </span>
          </dd>
          <dt>{t("assistant.facts.coverage")}</dt>
          <dd>
            {months === null
              ? t("assistant.facts.coverage_none")
              : t("assistant.facts.coverage_value", { months })}
          </dd>
        </dl>
        <ul className={shell.muted}>
          {facts.stress.map((s) => (
            <li key={s.dropBps}>
              {t("assistant.facts.stress", {
                drop: pct(s.dropBps),
                share: pct(s.lossShareBps),
              })}
            </li>
          ))}
        </ul>
        <p className={shell.muted}>{t("assistant.facts.assumptions")}</p>
      </section>

      {enabled ? (
        <>
          <AssistantChat spaceId={space.id} suggestions={suggestions} />
          <p className={shell.muted}>{t("assistant.privacy")}</p>
        </>
      ) : (
        <p role="status">{t("assistant.unavailable")}</p>
      )}

      <section aria-labelledby="sim-title" className={local.sim}>
        <h2 id="sim-title" className={local.h2}>
          {t("assistant.sim.title")}
        </h2>
        <p className={shell.muted}>{t("assistant.sim.intro")}</p>
        <form method="get" className={local.simForm}>
          <SimField
            name="amount"
            label={t("assistant.sim.amount")}
            value={query.amount ?? "10000"}
            inputMode="decimal"
          />
          <SimField
            name="months"
            label={t("assistant.sim.months")}
            value={query.months ?? "12"}
            inputMode="numeric"
          />
          <SimField
            name="annualReturn"
            label={t("assistant.sim.return")}
            value={query.annualReturn ?? "7"}
            inputMode="decimal"
          />
          <SimField
            name="drop"
            label={t("assistant.sim.drop")}
            value={query.drop ?? "20"}
            inputMode="decimal"
          />
          <button type="submit" className={fields.submit}>
            {t("assistant.sim.submit")}
          </button>
        </form>
        {simError ? (
          <p className={fields.alert} role="alert">
            {t(simError)}
          </p>
        ) : null}
        {simulation?.ok ? (
          <>
            <table className={local.table}>
              <caption className={shell.muted}>
                {t("assistant.sim.caption", {
                  months: String(simulation.value.explanation.months),
                })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t("assistant.sim.col.path")}</th>
                  <th scope="col">{t("assistant.sim.col.lump")}</th>
                  <th scope="col">{t("assistant.sim.col.periodic")}</th>
                  <th scope="col">{t("assistant.sim.col.diff")}</th>
                </tr>
              </thead>
              <tbody>
                {simulation.value.value.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{t(`assistant.sim.path.${row.id}`)}</th>
                    <td>
                      <Amount value={row.lump} />
                    </td>
                    <td>
                      <Amount value={row.periodic} />
                    </td>
                    <td>
                      <Amount value={sub(row.lump, row.periodic)} signed />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={shell.muted}>{t("assistant.sim.note")}</p>
          </>
        ) : null}
      </section>

      <p className={styles.links}>
        <Link href={`/s/${space.id}/exposicion`}>{t("exposure.title")}</Link>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

function SimField({
  name,
  label,
  value,
  inputMode,
}: {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly inputMode: "decimal" | "numeric";
}) {
  return (
    <div className={fields.field}>
      <label className={fields.label} htmlFor={`sim-${name}`}>
        {label}
      </label>
      <input
        id={`sim-${name}`}
        className={fields.input}
        name={name}
        defaultValue={value}
        inputMode={inputMode}
        maxLength={32}
        required
      />
    </div>
  );
}

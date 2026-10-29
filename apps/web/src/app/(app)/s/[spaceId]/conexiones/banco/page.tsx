import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { t } from "@/lib/i18n";
import { readPublicEnv } from "@/lib/env";
import { requireReadyUser } from "@/server/auth";
import { bankList } from "@/server/connections-model";
import { callConnectBank } from "@/server/edge";
import { loadSpace } from "@/server/queries/home";
import styles from "../../../../../page.module.css";
import { BankStart } from "./bank-start";

export const metadata: Metadata = { title: t("connections.bank.title") };

const COUNTRY = "ES";

export default async function ConnectBankPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const { supabase } = await requireReadyUser();
  const space = await loadSpace(supabase, parsed.data);
  if (!space) notFound();

  const env = readPublicEnv();
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const listed =
    env && token ? await callConnectBank(env, token, { action: "banks", country: COUNTRY }) : null;
  const banks = bankList.safeParse(listed?.ok ? listed.data : null);

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("connections.bank.title")}</h1>
      <p className={styles.lead}>{t("connections.bank.intro")}</p>
      {banks.success && banks.data.banks.length > 0 ? (
        <BankStart
          spaceId={space.id}
          country={COUNTRY}
          banks={banks.data.banks.map((b) => b.name)}
        />
      ) : (
        <p role="alert">{t("connections.bank.unavailable")}</p>
      )}
      <p className={styles.links}>
        <Link href={`/s/${space.id}/conexiones`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

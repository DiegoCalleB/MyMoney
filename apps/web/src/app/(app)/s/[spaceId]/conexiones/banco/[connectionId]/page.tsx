import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { readPublicEnv } from "@/lib/env";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { bankAccount } from "@/server/connections-model";
import { callConnectBank } from "@/server/edge";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";
import styles from "../../../../../../page.module.css";
import { BankLink } from "./bank-link";

export const metadata: Metadata = { title: t("connections.bank.link_title") };

export default async function LinkBankPage({
  params,
}: {
  params: Promise<{ spaceId: string; connectionId: string }>;
}) {
  const raw = await params;
  const ids = z.object({ spaceId: z.uuid(), connectionId: z.uuid() }).safeParse(raw);
  if (!ids.success) notFound();
  const { spaceId, connectionId } = ids.data;
  const { supabase } = await requireReadyUser();
  const space = await loadSpace(supabase, spaceId);
  if (!space) notFound();

  // Si ya está vinculada, no hay nada más que hacer aquí.
  const links = await supabase
    .from("connection_accounts")
    .select("account_id")
    .eq("connection_id", connectionId)
    .limit(1);
  if (links.error) throw new Error("No se pudieron cargar las cuentas vinculadas");
  if (links.data.length > 0) redirect(`/s/${spaceId}/conexiones`);

  const env = readPublicEnv();
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const offered =
    env && token
      ? await callConnectBank(env, token, { action: "accounts", connection_id: connectionId })
      : null;
  const bankAccounts = z.array(bankAccount).safeParse(offered?.ok ? offered.data.accounts : null);
  if (!bankAccounts.success) notFound();

  const today = calendarDateInZone(new Date(), space.timezone);
  const mine = (await loadAccountOptions(supabase, spaceId, today)).filter((a) => !a.is_liability);

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("connections.bank.link_title")}</h1>
      <p className={styles.lead}>{t("connections.bank.link_intro")}</p>
      {bankAccounts.data.length === 0 ? (
        <p role="alert">{t("connections.bank.no_bank_accounts")}</p>
      ) : (
        <BankLink
          spaceId={spaceId}
          connectionId={connectionId}
          bankAccounts={bankAccounts.data.map((a) => ({
            uid: a.uid,
            hint: a.hint,
            currency: a.currency || "EUR",
          }))}
          mine={mine.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        />
      )}
      <p className={styles.links}>
        <Link href={`/s/${spaceId}/conexiones`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

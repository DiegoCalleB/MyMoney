import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { revokeConnectionAction, syncNowAction } from "@/app/actions/connections";
import fieldStyles from "@/components/fields.module.css";
import { calendarDateInZone } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import {
  connectionAccountRow,
  connectionAttentionKey,
  connectionRow,
  syncNoticeKey,
} from "@/server/connections-model";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";
import styles from "../../../../page.module.css";
import shell from "../../../shell.module.css";

export const metadata: Metadata = { title: t("connections.title") };

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

export default async function ConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ sync?: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).spaceId);
  if (!parsed.success) notFound();
  const notice = syncNoticeKey((await searchParams).sync);

  const { supabase } = await requireReadyUser();
  const space = await loadSpace(supabase, parsed.data);
  if (!space) notFound();
  const today = calendarDateInZone(new Date(), space.timezone);
  const [connections, links, accounts] = await Promise.all([
    supabase
      .from("connections")
      .select("id,provider,status,last_success_at,last_error_code,consent_expires_at")
      .eq("space_id", space.id)
      .neq("status", "revoked")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("connection_accounts")
      .select("connection_id,account_id")
      .eq("space_id", space.id),
    loadAccountOptions(supabase, space.id, today),
  ]);
  if (connections.error || links.error) throw new Error("No se pudieron cargar las conexiones");
  const rows = z.array(connectionRow).parse(connections.data);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const accountOf = new Map(
    z
      .array(connectionAccountRow)
      .parse(links.data)
      .map((l) => [l.connection_id, names.get(l.account_id)]),
  );

  return (
    <main id="contenido" className={styles.main}>
      <h1 className={styles.title}>{t("connections.title")}</h1>
      <p className={styles.lead}>{t("connections.intro")}</p>
      {notice ? <p role="status">{t(notice)}</p> : null}
      {rows.length === 0 ? (
        <p>{t("connections.empty")}</p>
      ) : (
        <ul>
          {rows.map((c) => {
            const attention = connectionAttentionKey(c);
            const linked = accountOf.get(c.id);
            return (
              <li key={c.id}>
                <h2 className={styles.heading2}>
                  {t(`connections.provider.${c.provider}`)} · {t(`connections.status.${c.status}`)}
                </h2>
                {linked ? <p>{t("connections.linked_to", { name: linked })}</p> : null}
                <p className={shell.muted}>
                  {c.last_success_at
                    ? t("connections.last_sync", {
                        date: dateTime.format(new Date(c.last_success_at)),
                      })
                    : t("connections.never_synced")}
                </p>
                {attention ? <p role="status">{t(attention)}</p> : null}
                <div className={styles.links}>
                  {c.status === "active" ? (
                    <form action={syncNowAction}>
                      <input type="hidden" name="spaceId" value={space.id} />
                      <input type="hidden" name="connectionId" value={c.id} />
                      <button className={fieldStyles.submit} type="submit">
                        {t("connections.sync_now")}
                      </button>
                    </form>
                  ) : null}
                  <form action={revokeConnectionAction}>
                    <input type="hidden" name="spaceId" value={space.id} />
                    <input type="hidden" name="connectionId" value={c.id} />
                    <button className={fieldStyles.submit} type="submit">
                      {t("connections.revoke")}
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className={shell.muted}>{t("connections.revoke_note")}</p>
      <p className={styles.links}>
        <Link className={styles.primary} href={`/s/${space.id}/conexiones/binance`}>
          {t("connections.add_binance")}
        </Link>
        <Link href={`/s/${space.id}/inicio`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

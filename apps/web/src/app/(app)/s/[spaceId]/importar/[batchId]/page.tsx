import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { revertImportAction } from "@/app/actions/imports";
import { t } from "@/lib/i18n";
import { requireReadyUser } from "@/server/auth";
import { loadBatch, loadBatchRows } from "@/server/imports";
import styles from "../../../../../page.module.css";
import fieldStyles from "@/components/fields.module.css";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: t("import.preview.title") };

const REVERT_WINDOW_MS = 24 * 60 * 60 * 1000;

const searchSchema = z.object({
  omitidas: z.coerce.number().int().min(0).max(100000).optional().catch(undefined),
  plantilla: z.enum(["trade_republic", "binance", "etoro"]).optional().catch(undefined),
  sinverificar: z.literal("1").optional().catch(undefined),
});

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string; batchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ids = z.object({ spaceId: z.uuid(), batchId: z.uuid() }).safeParse(await params);
  if (!ids.success) notFound();
  const { spaceId, batchId } = ids.data;

  const hints = searchSchema.parse(await searchParams);
  const { supabase } = await requireReadyUser();
  const batch = await loadBatch(supabase, spaceId, batchId);
  if (!batch) notFound();
  const rows = await loadBatchRows(supabase, spaceId, batchId);
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const errors = rows.filter((r) => r.status === "error");
  const imported = count("imported");
  const revertible =
    batch.status === "committed" &&
    batch.committed_at !== null &&
    Date.now() - Date.parse(batch.committed_at) < REVERT_WINDOW_MS;

  return (
    <main id="contenido" className={styles.main}>
      {batch.status === "previewed" ? (
        <>
          <h1 className={styles.title}>{t("import.preview.title")}</h1>
          {hints.plantilla ? (
            <p role="status">
              {t("import.preview.template", { name: t(`import.template.${hints.plantilla}`) })}
            </p>
          ) : null}
          {hints.sinverificar ? <p role="alert">{t("import.preview.unverified")}</p> : null}
          {hints.omitidas ? (
            <p>{t("import.preview.skipped", { count: String(hints.omitidas) })}</p>
          ) : null}
          <ul>
            <li>{t("import.preview.new", { count: String(count("new")) })}</li>
            <li>{t("import.preview.duplicate", { count: String(count("duplicate")) })}</li>
            <li>{t("import.preview.error", { count: String(errors.length) })}</li>
          </ul>
          {errors.length > 0 ? (
            <section aria-labelledby="problemas">
              <h2 id="problemas">{t("import.preview.errors_title")}</h2>
              <ul>
                {errors.slice(0, 20).map((r) => (
                  <li key={r.row_index}>
                    {t("import.preview.error_row", {
                      row: String(r.row_index),
                      reason: t(r.error_code ?? ""),
                    })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <ConfirmForm spaceId={spaceId} batchId={batchId} pending={count("new")} />
        </>
      ) : batch.status === "committed" ? (
        <>
          <h1 className={styles.title}>{t("import.done.title")}</h1>
          <p role="status">{t("import.done.summary", { count: String(imported) })}</p>
          {revertible ? (
            <form action={revertImportAction}>
              <input type="hidden" name="spaceId" value={spaceId} />
              <input type="hidden" name="batchId" value={batchId} />
              <p className={fieldStyles.hint}>{t("import.done.revert_hint")}</p>
              <button className={fieldStyles.submit} type="submit">
                {t("import.done.revert")}
              </button>
            </form>
          ) : null}
        </>
      ) : (
        <>
          <h1 className={styles.title}>{t("import.done.title")}</h1>
          <p role="status">{t("import.reverted")}</p>
        </>
      )}
      <p className={styles.links}>
        <Link href={`/s/${spaceId}/importar`}>{t("common.back")}</Link>
      </p>
    </main>
  );
}

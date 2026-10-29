"use server";

import { isCurrencyCode } from "@mymoney/finance-core";
import {
  ENTITY_TEMPLATES,
  MAX_FILE_BYTES,
  analyzeStatement,
  commitPayload,
  looksLikeXlsx,
  previewPayload,
  toHex,
} from "@mymoney/importers";
import { confirmImportInput, importBatchInput, previewImportInput } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { isMessageKey } from "@/lib/i18n";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { loadBatch, loadBatchRows } from "@/server/imports";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";
import { calendarDateInZone } from "@/lib/dates";

const BUCKET = "imports";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Código del análisis a texto del catálogo; lo desconocido es un error genérico de lectura. */
function analysisMessage(code: string): string {
  return isMessageKey(code) ? code : "import.file_invalid";
}

/**
 * Sube un extracto, lo analiza en el servidor y registra la vista previa. El libro no se toca
 * aquí: solo `import_preview` (huellas por fila, ADR-0008). El original queda en el bucket
 * privado de su espacio hasta confirmar o descartar.
 */
export async function previewImportAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = previewImportInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    accountId: formText(formData, "accountId"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, accountId } = parsed.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { fieldErrors: { file: "import.file_missing" } };
  }
  if (file.size > MAX_FILE_BYTES) return { fieldErrors: { file: "import.file_too_large" } };
  if (!/\.(csv|xlsx)$/i.test(file.name)) return { fieldErrors: { file: "import.file_not_csv" } };

  const space = await loadSpace(supabase, spaceId);
  if (!space) return { error: "importfile.failed" };
  const today = calendarDateInZone(new Date(), space.timezone);
  const account = (await loadAccountOptions(supabase, spaceId, today)).find(
    (a) => a.id === accountId,
  );
  // La moneda sale de la cuenta, nunca del archivo ni del formulario.
  if (!account || !isCurrencyCode(account.currency)) {
    return { fieldErrors: { accountId: "importfile.account_invalid" } };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const analysis = analyzeStatement(
    { bytes, accountId, currency: account.currency },
    ENTITY_TEMPLATES,
  );
  if (!analysis.ok) return { fieldErrors: { file: analysisMessage(analysis.error.code) } };
  const fileHex = toHex(analysis.value.fileSha256);
  // El tipo lo decide el contenido, no el nombre: un .csv que es un ZIP se trata como Excel.
  const kind = looksLikeXlsx(bytes) ? "xlsx" : "csv";

  // Una ruta por espacio, cuenta y archivo: dos cuentas con el mismo archivo no comparten original.
  const path = `${spaceId}/${accountId}-${fileHex}.${kind}`;
  const uploaded = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: kind === "xlsx" ? XLSX_MIME : "text/csv",
    upsert: true,
  });
  if (uploaded.error) {
    logger.warn("import.upload_failed", { spaceId });
    return { error: "importfile.failed" };
  }

  const preview = await supabase.rpc("import_preview", {
    p_space_id: spaceId,
    p_account_id: accountId,
    p_file_kind: kind,
    p_file_sha256: `\\x${fileHex}`,
    p_storage_path: path,
    p_rows: previewPayload(analysis.value, accountId),
  });
  if (preview.error) {
    logger.warn("import.preview_failed", { code: preview.error.code, spaceId });
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: "importfile.failed" };
  }
  const result = z
    .object({ status: z.enum(["previewed", "already_imported"]), batch_id: z.uuid() })
    .safeParse(preview.data);
  if (!result.success) return { error: "importfile.failed" };
  if (result.data.status === "already_imported") {
    // Ya se importó antes y su original se borró al confirmar: se retira la copia recién subida.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: "import.already_imported" };
  }
  // Lo que la plantilla dejó fuera a propósito no se guarda en la base de datos: viaja en la URL
  // (solo un número y el id de la plantilla, nunca datos del archivo).
  const extra = new URLSearchParams();
  if (analysis.value.skipped > 0) extra.set("omitidas", String(analysis.value.skipped));
  if (analysis.value.template) {
    extra.set("plantilla", analysis.value.template.id);
    if (!analysis.value.template.verified) extra.set("sinverificar", "1");
  }
  const query = extra.size > 0 ? `?${extra.toString()}` : "";
  redirect(`/s/${spaceId}/importar/${result.data.batch_id}${query}`);
}

/**
 * Confirma una vista previa. Se vuelve a leer el original del bucket y se comprueba que su
 * huella coincide con la registrada; solo se envían las filas que la base de datos marcó como
 * nuevas. `import_commit` crea todos los movimientos o ninguno.
 */
export async function confirmImportAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireReadyUser();
  const parsed = confirmImportInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    batchId: formText(formData, "batchId"),
    keepDescriptions: formText(formData, "keepDescriptions") === "on",
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, batchId, keepDescriptions } = parsed.data;

  const batch = await loadBatch(supabase, spaceId, batchId);
  if (!batch?.storage_path || batch.status !== "previewed") {
    return { error: "import.not_found" };
  }
  const space = await loadSpace(supabase, spaceId);
  if (!space) return { error: "import.confirm_failed" };
  const today = calendarDateInZone(new Date(), space.timezone);
  const account = (await loadAccountOptions(supabase, spaceId, today)).find(
    (a) => a.id === batch.account_id,
  );
  if (!account || !isCurrencyCode(account.currency)) return { error: "import.confirm_failed" };

  const downloaded = await supabase.storage.from(BUCKET).download(batch.storage_path);
  if (downloaded.error) {
    logger.warn("import.download_failed", { spaceId });
    return { error: "import.confirm_failed" };
  }
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const analysis = analyzeStatement(
    { bytes, accountId: batch.account_id, currency: account.currency },
    ENTITY_TEMPLATES,
  );
  if (!analysis.ok) return { error: "import.confirm_failed" };
  if (toHex(analysis.value.fileSha256) !== batch.file_sha256) {
    logger.warn("import.hash_mismatch", { spaceId });
    return { error: "import.file_changed" };
  }

  const rows = await loadBatchRows(supabase, spaceId, batchId);
  const pending = new Set(rows.filter((r) => r.status === "new").map((r) => r.row_index));
  if (pending.size === 0) return { error: "import.preview.nothing_new" };

  const committed = await supabase.rpc("import_commit", {
    p_batch_id: batchId,
    p_transactions: commitPayload(analysis.value, batch.account_id, pending, keepDescriptions),
  });
  if (committed.error) {
    logger.warn("import.commit_failed", { code: committed.error.code, spaceId });
    return { error: "import.confirm_failed" };
  }

  // El original ya no hace falta (ADR-0008): se borra y se anota. Si el borrado fallara, la
  // purga programada lo recogerá; la importación ya está hecha.
  const removed = await supabase.storage.from(BUCKET).remove([batch.storage_path]);
  if (removed.error) {
    logger.warn("import.cleanup_failed", { spaceId });
  } else {
    await supabase
      .from("import_batches")
      .update({ storage_path: null, original_deleted_at: new Date().toISOString() })
      .eq("id", batchId)
      .eq("space_id", spaceId);
  }
  redirect(`/s/${spaceId}/importar/${batchId}`);
}

/** Descarta una vista previa sin confirmar y borra el original. */
export async function discardImportAction(formData: FormData): Promise<void> {
  const { supabase } = await requireReadyUser();
  const parsed = importBatchInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    batchId: formText(formData, "batchId"),
  });
  if (!parsed.success) redirect("/hogares");
  const { spaceId, batchId } = parsed.data;
  const batch = await loadBatch(supabase, spaceId, batchId);
  if (batch?.status === "previewed") {
    const discarded = await supabase.rpc("import_discard", { p_batch_id: batchId });
    if (discarded.error) {
      logger.warn("import.discard_failed", { code: discarded.error.code, spaceId });
    } else if (batch.storage_path) {
      await supabase.storage.from(BUCKET).remove([batch.storage_path]);
    }
  }
  redirect(`/s/${spaceId}/importar`);
}

/** Deshace una importación confirmada hace menos de 24 h (lo impone `import_revert`). */
export async function revertImportAction(formData: FormData): Promise<void> {
  const { supabase } = await requireReadyUser();
  const parsed = importBatchInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    batchId: formText(formData, "batchId"),
  });
  if (!parsed.success) redirect("/hogares");
  const { spaceId, batchId } = parsed.data;
  const reverted = await supabase.rpc("import_revert", { p_batch_id: batchId });
  if (reverted.error) {
    logger.warn("import.revert_failed", { code: reverted.error.code, spaceId });
  }
  redirect(`/s/${spaceId}/importar/${batchId}`);
}

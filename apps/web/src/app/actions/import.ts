"use server";

import {
  analyzeIngPaste,
  categoryKey,
  ingCategory,
  ingImportTransactions,
  type CategoryChoice,
} from "@mymoney/importers";
import { importBatchInput, importTextInput } from "@mymoney/schemas";
import { z } from "zod";
import { fieldErrorsFrom, formText } from "@/components/form-state";
import type { ImportPreview, ImportState } from "@/components/import-state";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";

const previewResult = z.object({
  status: z.enum(["previewed", "already_imported"]),
  batch_id: z.uuid(),
  new: z.number().int().optional(),
  duplicate: z.number().int().optional(),
  error: z.number().int().optional(),
});
const commitResult = z.object({ batch_id: z.uuid(), imported: z.number().int() });
const rowStates = z.array(
  z.object({ row_index: z.number().int(), fingerprint: z.string(), status: z.string() }),
);

/** Traduce el código de error de la base de datos a una clave del catálogo, sin detalles. */
function failure(code: string): ImportState {
  logger.warn("import.rpc_failed", { code });
  if (code === "42501") return { error: "import.forbidden" };
  if (code === "23514" || code === "22023") return { error: "import.state_invalid" };
  return { error: "import.failed" };
}

function readText(formData: FormData) {
  return importTextInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    accountId: formText(formData, "accountId"),
    text: formText(formData, "text"),
    ownName: formText(formData, "ownName") || undefined,
  });
}

/** Comprueba que la cuenta es del hogar y se puede importar en ella (no es una deuda). */
async function resolveAccount(
  supabase: Awaited<ReturnType<typeof requireReadyUser>>["supabase"],
  spaceId: string,
  accountId: string,
) {
  const space = await loadSpace(supabase, spaceId);
  if (!space) return null;
  const today = calendarDateInZone(new Date(), space.timezone);
  const accounts = await loadAccountOptions(supabase, spaceId, today);
  return accounts.find((a) => a.id === accountId && !a.is_liability) ?? null;
}

/**
 * Asegura que existen las categorías que usará la importación (por tipo y nombre) y devuelve su
 * id. Las que faltan se crean; las que ya existen, también las archivadas, se reutilizan.
 */
async function ensureCategories(
  supabase: Awaited<ReturnType<typeof requireReadyUser>>["supabase"],
  spaceId: string,
  needed: readonly CategoryChoice[],
): Promise<Map<string, string> | null> {
  const wanted = new Map(needed.map((c) => [categoryKey(c), c]));
  const found = await supabase
    .from("categories")
    .select("id,name,kind,archived_at")
    .eq("space_id", spaceId)
    .limit(1000);
  if (found.error) return null;
  const ids = new Map<string, string>();
  for (const row of z
    .array(z.object({ id: z.uuid(), name: z.string(), kind: z.enum(["income", "expense"]) }))
    .parse(found.data)) {
    ids.set(categoryKey(row), row.id);
  }
  const missing = [...wanted.entries()].filter(([key]) => !ids.has(key)).map(([, c]) => c);
  if (missing.length > 0) {
    const created = await supabase
      .from("categories")
      .insert(
        missing.map((c) => ({
          space_id: spaceId,
          name: c.name,
          kind: c.kind,
          essential: c.kind === "expense" && c.essential,
        })),
      )
      .select("id,name,kind");
    if (created.error) return null;
    for (const row of z
      .array(z.object({ id: z.uuid(), name: z.string(), kind: z.enum(["income", "expense"]) }))
      .parse(created.data)) {
      ids.set(categoryKey(row), row.id);
    }
  }
  return ids;
}

/** Lee el texto pegado y registra la vista previa: no crea ningún movimiento. */
export async function previewImportAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { supabase } = await requireReadyUser();
  const parsed = readText(formData);
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, accountId, text, ownName } = parsed.data;

  const account = await resolveAccount(supabase, spaceId, accountId);
  if (!account) return { fieldErrors: { accountId: "import.account_invalid" } };
  const analysis = analyzeIngPaste(text, accountId, {
    currency: account.currency,
    ...(ownName ? { ownNames: [ownName] } : {}),
  });
  if (!analysis.ok) return { fieldErrors: { text: analysis.error.code } };
  const { rows, fingerprints } = analysis.value;

  const preview = await supabase.rpc("import_preview", {
    p_space_id: spaceId,
    p_account_id: accountId,
    p_file_kind: "csv",
    p_file_sha256: `\\x${analysis.value.fileSha256}`,
    p_rows: rows.map((row, i) => ({ row_index: row.index, fingerprint: fingerprints[i] })),
  });
  if (preview.error) return failure(preview.error.code);
  const result = previewResult.parse(preview.data);

  const dates = rows.map((r) => r.date).sort();
  const base = {
    batchId: result.batch_id,
    internal: analysis.value.internal,
    pending: analysis.value.pending,
    unreadable: analysis.value.unreadable,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
  if (result.status === "already_imported") {
    const empty: ImportPreview = {
      ...base,
      alreadyImported: true,
      newCount: 0,
      duplicateCount: rows.length,
      errorCount: 0,
      sample: [],
    };
    return { preview: empty };
  }

  const states = await supabase
    .from("import_rows")
    .select("row_index,fingerprint,status")
    .eq("batch_id", result.batch_id)
    .eq("space_id", spaceId)
    .limit(5000);
  if (states.error) return failure(states.error.code);
  const fresh = new Set(
    rowStates
      .parse(states.data)
      .filter((r) => r.status === "new")
      .map((r) => r.row_index),
  );
  return {
    preview: {
      ...base,
      alreadyImported: false,
      newCount: result.new ?? 0,
      duplicateCount: result.duplicate ?? 0,
      errorCount: result.error ?? 0,
      sample: rows
        .filter((r) => fresh.has(r.index))
        .slice(0, 15)
        .map((r) => ({
          date: r.date,
          description: r.description,
          minor: r.amount.minor.toString(),
          currency: r.amount.currency,
          category: r.category,
        })),
    },
  };
}

/** Confirma la vista previa: crea los movimientos nuevos, todos o ninguno. */
export async function confirmImportAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { supabase } = await requireReadyUser();
  const parsed = readText(formData);
  const batch = importBatchInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    batchId: formText(formData, "batchId"),
  });
  if (!parsed.success || !batch.success) return { error: "import.failed" };
  const { spaceId, accountId, text, ownName } = parsed.data;

  const account = await resolveAccount(supabase, spaceId, accountId);
  if (!account) return { error: "import.account_invalid" };
  const analysis = analyzeIngPaste(text, accountId, {
    currency: account.currency,
    ...(ownName ? { ownNames: [ownName] } : {}),
  });
  if (!analysis.ok) return { error: "import.failed" };

  // Solo se importan las filas que la base de datos marcó como nuevas Y cuya huella coincide con
  // el texto que llega ahora: si el texto cambió entre la vista previa y la confirmación, se aborta.
  const states = await supabase
    .from("import_rows")
    .select("row_index,fingerprint,status")
    .eq("batch_id", batch.data.batchId)
    .eq("space_id", spaceId)
    .limit(5000);
  if (states.error) return failure(states.error.code);
  const stored = rowStates.parse(states.data);
  const expected = new Map(
    analysis.value.rows.map((r, i) => [r.index, analysis.value.fingerprints[i]]),
  );
  const fresh = stored.filter((r) => r.status === "new");
  const consistent = stored.every(
    (r) => expected.get(r.row_index) === r.fingerprint.replace(/^\\x/, ""),
  );
  if (!consistent || fresh.length === 0) return { error: "import.changed" };

  const only = new Set(fresh.map((r) => r.row_index));
  const categoryIds = await ensureCategories(
    supabase,
    spaceId,
    analysis.value.rows.filter((r) => only.has(r.index)).map(ingCategory),
  );
  if (!categoryIds) return { error: "import.failed" };

  const commit = await supabase.rpc("import_commit", {
    p_batch_id: batch.data.batchId,
    p_transactions: ingImportTransactions(analysis.value.rows, accountId, only, categoryIds),
  });
  if (commit.error) return failure(commit.error.code);
  const result = commitResult.parse(commit.data);
  return { done: { imported: result.imported, batchId: result.batch_id } };
}

/** Descarta una vista previa que no se quiere confirmar. */
export async function discardImportAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { supabase } = await requireReadyUser();
  const batch = importBatchInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    batchId: formText(formData, "batchId"),
  });
  if (!batch.success) return { error: "import.failed" };
  const result = await supabase.rpc("import_discard", { p_batch_id: batch.data.batchId });
  if (result.error) return failure(result.error.code);
  return { discarded: true };
}

/** Deshace una importación confirmada hace menos de 24 horas. */
export async function undoImportAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { supabase } = await requireReadyUser();
  const batch = importBatchInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    batchId: formText(formData, "batchId"),
  });
  if (!batch.success) return { error: "import.failed" };
  const result = await supabase.rpc("import_revert", { p_batch_id: batch.data.batchId });
  if (result.error) return failure(result.error.code);
  return { undone: true };
}

import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** `bytea` llega de PostgREST como `\x` más hexadecimal. */
const byteaHex = z
  .string()
  .regex(/^\\x[0-9a-f]{64}$/i)
  .transform((value) => value.slice(2).toLowerCase());

export const batchRow = z.object({
  id: z.uuid(),
  space_id: z.uuid(),
  account_id: z.uuid(),
  file_sha256: byteaHex,
  storage_path: z.string().nullable(),
  row_count: z.number().int(),
  status: z.enum(["previewed", "committed", "reverted"]),
  created_at: z.string(),
  committed_at: z.string().nullable(),
});
export type BatchRow = z.infer<typeof batchRow>;

const BATCH_COLUMNS =
  "id,space_id,account_id,file_sha256,storage_path,row_count,status,created_at,committed_at";

/** Una importación del espacio, o null si no existe o no se puede ver (RLS decide). */
export async function loadBatch(
  supabase: Supabase,
  spaceId: string,
  batchId: string,
): Promise<BatchRow | null> {
  const { data, error } = await supabase
    .from("import_batches")
    .select(BATCH_COLUMNS)
    .eq("space_id", spaceId)
    .eq("id", batchId)
    .maybeSingle();
  if (error) {
    logger.error("import.batch_query_failed", { code: error.code });
    throw new Error("No se pudo cargar la importación");
  }
  return data ? batchRow.parse(data) : null;
}

export async function loadRecentBatches(supabase: Supabase, spaceId: string): Promise<BatchRow[]> {
  const { data, error } = await supabase
    .from("import_batches")
    .select(BATCH_COLUMNS)
    .eq("space_id", spaceId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    logger.error("import.batch_query_failed", { code: error.code });
    throw new Error("No se pudieron cargar las importaciones");
  }
  return z.array(batchRow).parse(data);
}

const importRow = z.object({
  row_index: z.number().int(),
  status: z.enum(["new", "duplicate", "error", "imported"]),
  error_code: z.string().nullable(),
});
export type ImportRow = z.infer<typeof importRow>;

export async function loadBatchRows(
  supabase: Supabase,
  spaceId: string,
  batchId: string,
): Promise<ImportRow[]> {
  const { data, error } = await supabase
    .from("import_rows")
    .select("row_index,status,error_code")
    .eq("space_id", spaceId)
    .eq("batch_id", batchId)
    .order("row_index", { ascending: true })
    .limit(5000);
  if (error) {
    logger.error("import.rows_query_failed", { code: error.code });
    throw new Error("No se pudieron cargar las filas");
  }
  return z.array(importRow).parse(data);
}

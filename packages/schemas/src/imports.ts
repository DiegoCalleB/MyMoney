import { z } from "zod";
import { uuid } from "./common";

/** Subida de un extracto: el archivo llega aparte (FormData); aquí solo los identificadores. */
export const previewImportInput = z.object({ spaceId: uuid, accountId: uuid });
export type PreviewImportInput = z.infer<typeof previewImportInput>;

/** Cualquier acción sobre una importación ya registrada (confirmar, descartar, deshacer). */
export const importBatchInput = z.object({ spaceId: uuid, batchId: uuid });
export type ImportBatchInput = z.infer<typeof importBatchInput>;

export const confirmImportInput = importBatchInput.extend({ keepDescriptions: z.boolean() });
export type ConfirmImportInput = z.infer<typeof confirmImportInput>;

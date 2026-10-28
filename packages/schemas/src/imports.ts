import { z } from "zod";
import { uuid } from "./common";

/** Tope del texto pegado: el mismo que aplica el lector en el servidor. */
export const MAX_IMPORT_TEXT = 2 * 1024 * 1024;

/**
 * Texto copiado de la web del banco para una cuenta. `ownName` es el nombre de la persona tal
 * como lo escribe su banco; sirve para reconocer las transferencias a sí misma y no se guarda.
 */
export const importTextInput = z.object({
  spaceId: uuid,
  accountId: uuid,
  text: z
    .string()
    .min(1, { error: "import.text_required" })
    .max(MAX_IMPORT_TEXT, { error: "import.file_too_large" }),
  ownName: z.string().trim().max(120, { error: "validation.name_too_long" }).optional(),
});
export type ImportTextInput = z.infer<typeof importTextInput>;

/** Confirmar, descartar o deshacer una importación ya registrada. */
export const importBatchInput = z.object({ spaceId: uuid, batchId: uuid });
export type ImportBatchInput = z.infer<typeof importBatchInput>;

/** Subida de un extracto: el archivo llega aparte (FormData); aquí solo los identificadores. */
export const previewImportInput = z.object({ spaceId: uuid, accountId: uuid });
export type PreviewImportInput = z.infer<typeof previewImportInput>;

export const confirmImportInput = importBatchInput.extend({ keepDescriptions: z.boolean() });
export type ConfirmImportInput = z.infer<typeof confirmImportInput>;

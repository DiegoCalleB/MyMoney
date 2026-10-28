import { describe, expect, it } from "vitest";
import { confirmImportInput, importBatchInput, previewImportInput } from "@mymoney/schemas";
import { isMessageKey, t } from "@/lib/i18n";

// Códigos que el análisis de un extracto puede devolver: todos deben tener texto propio.
const ANALYSIS_CODES = [
  "import.file_too_large",
  "import.no_data",
  "import.mapping_not_detected",
  "csv.cell_too_long",
  "csv.too_many_rows",
  "csv.unterminated_quote",
  "csv.empty",
  "row.too_short",
  "row.date_invalid",
  "row.amount_invalid",
  "row.amount_missing",
  "row.amount_ambiguous",
  "row.amount_zero",
  "row.amount_too_large",
  "row.balance_invalid",
];

describe("textos de la importación", () => {
  it.each(ANALYSIS_CODES)("%s tiene texto en el catálogo", (code) => {
    expect(isMessageKey(code)).toBe(true);
    expect(t(code)).not.toBe(t("error.body"));
  });

  it("los mensajes de error de los esquemas de importación existen", () => {
    const failures = [
      previewImportInput.safeParse({ spaceId: "x", accountId: "y" }),
      importBatchInput.safeParse({ spaceId: "x", batchId: "y" }),
      confirmImportInput.safeParse({ spaceId: "x", batchId: "y", keepDescriptions: true }),
    ];
    for (const result of failures) {
      expect(result.success).toBe(false);
      if (result.success) continue;
      for (const issue of result.error.issues) expect(isMessageKey(issue.message)).toBe(true);
    }
  });

  it("los esquemas aceptan identificadores válidos", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(previewImportInput.safeParse({ spaceId: id, accountId: id }).success).toBe(true);
    expect(
      confirmImportInput.safeParse({ spaceId: id, batchId: id, keepDescriptions: false }).success,
    ).toBe(true);
  });
});

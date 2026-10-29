import { parseShareToBps } from "@/lib/percent";

export interface CompositionEntry {
  readonly key: string;
  readonly weightBps: number;
}

export type CompositionParse =
  | { readonly ok: true; readonly entries: readonly CompositionEntry[] }
  | { readonly ok: false; readonly code: string };

/** Etiqueta con espacios simples, 1 a 80 caracteres. */
export function cleanKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Filas «etiqueta + porcentaje» de un formulario. Las filas vacías se ignoran; cada etiqueta debe
 * ser distinta (sin distinguir mayúsculas), cada porcentaje mayor que 0 y la suma no puede pasar
 * de 100 % (una composición parcial es válida: lo que falta queda sin clasificar).
 */
export function parseComposition(
  rows: readonly { readonly key: string; readonly percent: string }[],
): CompositionParse {
  const entries: CompositionEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = cleanKey(row.key);
    const percent = row.percent.trim();
    if (key === "" && percent === "") continue;
    const weightBps = parseShareToBps(percent);
    if (key === "" || weightBps === null || weightBps === 0) {
      return { ok: false, code: "exposure.form.row_invalid" };
    }
    const id = key.toLocaleLowerCase("es-ES");
    if (seen.has(id)) return { ok: false, code: "exposure.form.duplicate" };
    seen.add(id);
    entries.push({ key, weightBps });
  }
  if (entries.length === 0) return { ok: false, code: "exposure.form.empty" };
  if (entries.reduce((sum, e) => sum + e.weightBps, 0) > 10_000) {
    return { ok: false, code: "exposure.form.over_100" };
  }
  return { ok: true, entries };
}

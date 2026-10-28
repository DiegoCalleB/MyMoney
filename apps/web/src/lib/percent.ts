/**
 * Porcentajes escritos por personas ↔ puntos básicos enteros, sin pasar por `number` con
 * decimales: "4,5" ↔ 450. Hasta dos decimales y entre 0 y 100 %.
 */
const PERCENT = /^(\d{1,3})(?:[.,](\d{1,2}))?$/;

export function parseShareToBps(text: string | undefined): number | null {
  const match = PERCENT.exec((text ?? "").trim());
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= 10_000 ? bps : null;
}

/** 450 → "4,5"; 500 → "5"; 5 → "0,05". */
export function formatBpsAsPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = String(bps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction === "" ? String(whole) : `${String(whole)},${fraction}`;
}

/** Meses enteros ("6", " 12 "); nada de decimales ni signos. */
export function parseWholeMonths(text: string | undefined): number | null {
  const match = /^\d{1,3}$/.exec((text ?? "").trim());
  return match ? Number(match[0]) : null;
}

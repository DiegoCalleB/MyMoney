import { addDays, compareDates, daysBetween, type CalendarDate } from "./calendar-date";
import type { CurrencyCode, Money } from "./money";

/**
 * Detección de cargos inusuales (ADR-0010, nivel 2): hechos sobre los movimientos de la propia
 * persona, para que los revise. Como los avisos, una regla no escribe texto: devuelve una clave
 * de mensaje y parámetros; el texto vive en el catálogo de la web. No acusa de nada: señala lo
 * que se sale de lo habitual y la persona decide si lo reconoce.
 */
export interface Movement {
  readonly id: string;
  readonly date: CalendarDate;
  readonly kind: "income" | "expense";
  readonly description: string | null;
  readonly categoryId: string | null;
  /** Importe en sentido natural: gasto positivo; un reembolso es negativo. */
  readonly amount: Money;
}

/** Umbrales editables: son supuestos de la persona, no verdades del programa. */
export interface AnomalyThresholds {
  /** Solo se revisan los movimientos de los últimos N días. */
  readonly windowDays: number;
  /** Veces la mediana de su categoría a partir de las cuales un gasto es inusual. */
  readonly amountFactor: number;
  /** Importe mínimo (unidades mínimas) para que un gasto sea inusual. */
  readonly minAmountMinor: bigint;
  /** Gastos previos de la categoría necesarios para saber qué es «lo habitual». */
  readonly minHistory: number;
  /** Días entre dos cargos iguales para sospechar un duplicado. */
  readonly duplicateDays: number;
  /** Subida de un cargo recurrente a partir de la cual se avisa (puntos básicos). */
  readonly changeBps: number;
  /** Subida mínima (unidades mínimas) de un cargo recurrente para avisar. */
  readonly minChangeMinor: bigint;
}

export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  windowDays: 45,
  amountFactor: 3,
  minAmountMinor: 5000n,
  minHistory: 5,
  duplicateDays: 3,
  changeBps: 1500,
  minChangeMinor: 100n,
};

export interface Anomaly {
  readonly ruleId: "possible_duplicate" | "recurring_change" | "unusual_amount";
  readonly version: 1;
  readonly movementId: string;
  readonly date: CalendarDate;
  readonly description: string | null;
  readonly categoryId: string | null;
  readonly amount: Money;
  readonly messageKey: string;
  /** Importes en unidades mínimas y fechas sin formato: los da formato la web. */
  readonly params: Readonly<Record<string, string>>;
}

export interface AnomalyExplanation {
  readonly method: "median_baseline_rules";
  readonly inputs: readonly string[];
  readonly assumptions: readonly string[];
  readonly reviewed: number;
  readonly dataQuality: "high" | "low";
}

/** Texto comparable: minúsculas, sin cifras ni signos (los comercios añaden fechas y números). */
function normalize(description: string | null): string {
  return (description ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function median(values: readonly bigint[]): bigint {
  const sorted = [...values].sort((a, b) => Number(a - b));
  const middle = sorted.slice((sorted.length - 1) >> 1, (sorted.length >> 1) + 1);
  return middle.reduce((sum, v) => sum + v, 0n) / BigInt(middle.length);
}

function monthsOf(items: readonly Movement[]): number {
  return new Set(items.map((m) => m.date.slice(0, 7))).size;
}

/**
 * Revisa los gastos de los últimos `windowDays` días frente al resto de movimientos. Devuelve
 * a lo sumo un hallazgo por movimiento (duplicado, si no cargo recurrente que sube, si no
 * importe inusual), del más reciente al más antiguo.
 */
export function detectAnomalies(
  movements: readonly Movement[],
  today: CalendarDate,
  baseCurrency: CurrencyCode,
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
): { readonly value: Anomaly[]; readonly explanation: AnomalyExplanation } {
  const expenses = movements.filter(
    (m) => m.kind === "expense" && m.amount.currency === baseCurrency && m.amount.minor > 0n,
  );
  const from = addDays(today, -thresholds.windowDays);
  const candidates = expenses.filter(
    (m) => compareDates(m.date, from) >= 0 && compareDates(m.date, today) <= 0,
  );
  const before = (a: Movement, b: Movement) =>
    compareDates(a.date, b.date) < 0 || (a.date === b.date && a.id < b.id);

  const value: Anomaly[] = [];
  for (const m of candidates) {
    const name = normalize(m.description);
    const base = {
      version: 1,
      movementId: m.id,
      date: m.date,
      description: m.description,
      categoryId: m.categoryId,
      amount: m.amount,
    } as const;

    const twin =
      name === ""
        ? undefined
        : expenses.find(
            (o) =>
              before(o, m) &&
              o.amount.minor === m.amount.minor &&
              normalize(o.description) === name &&
              daysBetween(o.date, m.date) <= thresholds.duplicateDays,
          );
    if (twin) {
      value.push({
        ...base,
        ruleId: "possible_duplicate",
        messageKey: "anomaly.possible_duplicate",
        params: { amount: m.amount.minor.toString(), date: m.date, other: twin.date },
      });
      continue;
    }

    const sameName =
      name === "" ? [] : expenses.filter((o) => before(o, m) && normalize(o.description) === name);
    const known = sameName.length >= 3 && monthsOf(sameName) >= 3;
    if (known) {
      const usual = median(sameName.map((o) => o.amount.minor));
      const rise = m.amount.minor - usual;
      if (
        rise >= thresholds.minChangeMinor &&
        rise * 10000n > usual * BigInt(thresholds.changeBps)
      ) {
        value.push({
          ...base,
          ruleId: "recurring_change",
          messageKey: "anomaly.recurring_change",
          params: { amount: m.amount.minor.toString(), usual: usual.toString() },
        });
      }
      continue;
    }

    const peers = expenses.filter((o) => before(o, m) && o.categoryId === m.categoryId);
    if (peers.length >= thresholds.minHistory) {
      const usual = median(peers.map((o) => o.amount.minor));
      if (
        m.amount.minor >= thresholds.minAmountMinor &&
        m.amount.minor >= usual * BigInt(thresholds.amountFactor)
      ) {
        // Veces lo habitual con un decimal (los gastos son positivos, la mediana también).
        const times = (m.amount.minor * 10n) / usual;
        value.push({
          ...base,
          ruleId: "unusual_amount",
          messageKey: "anomaly.unusual_amount",
          params: {
            amount: m.amount.minor.toString(),
            usual: usual.toString(),
            times: `${String(times / 10n)}.${String(times % 10n)}`,
          },
        });
      }
    }
  }

  value.sort((a, b) => compareDates(b.date, a.date) || a.movementId.localeCompare(b.movementId));
  return {
    value,
    explanation: {
      method: "median_baseline_rules",
      inputs: [
        "transactions.expense",
        "transactions.date",
        "transactions.description",
        "categories",
      ],
      assumptions: [
        `window_days=${String(thresholds.windowDays)}`,
        `amount_factor=${String(thresholds.amountFactor)}`,
        `duplicate_days=${String(thresholds.duplicateDays)}`,
        `change_bps=${String(thresholds.changeBps)}`,
      ],
      reviewed: candidates.length,
      dataQuality: expenses.length >= thresholds.minHistory ? "high" : "low",
    },
  };
}

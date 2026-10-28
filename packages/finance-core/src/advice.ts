import { daysBetween, type CalendarDate } from "./calendar-date";
import { Decimal } from "./decimal";
import { toDecimal, type CurrencyCode, type Money } from "./money";

/**
 * Motor de avisos (ADR-0010), niveles 1 y 2: hechos y umbrales sobre los datos de la propia
 * persona. Una regla no escribe texto: devuelve una clave de mensaje y parámetros; el texto
 * vive en el catálogo revisado de la web. Por eso ninguna regla puede nombrar un producto ni
 * una entidad ni decir qué comprar o vender.
 */
export interface AdviceAccount {
  readonly accountId: string;
  /** Entidad de la cuenta; `null` si no se indicó (esas cuentas no cuentan para la concentración). */
  readonly institutionId: string | null;
  readonly kind: string;
  /** Aportación al patrimonio en la moneda base (negativa en deudas). */
  readonly value: Money;
  readonly ageDays: number;
  readonly stale: boolean;
}

/** Bolsillo con su valor en la moneda base y el riesgo máximo que la persona admite en él. */
export interface AdvicePocket {
  readonly pocketId: string;
  readonly riskLevel: "none" | "low" | "medium" | "high" | "speculative";
  readonly value: Money;
}

/** Operaciones planificadas aún sin hacer, para avisar de las que ya han vencido. */
export interface AdviceSchedule {
  /** "Hoy" en la zona del espacio: la librería no lee el reloj. */
  readonly onDate: CalendarDate;
  /** Fechas previstas de las operaciones con estado «planificada». */
  readonly pending: readonly CalendarDate[];
}

/** Umbrales editables: son supuestos de la persona, no verdades del programa. */
export interface AdviceThresholds {
  /** Parte del patrimonio en bolsillos especulativos a partir de la cual se avisa (puntos básicos). */
  readonly speculativeShareBps: number;
  /** Parte del patrimonio en una sola entidad a partir de la cual se avisa (puntos básicos). */
  readonly institutionShareBps: number;
  /** Parte en efectivo y cuentas de ahorro a partir de la cual se informa (puntos básicos). */
  readonly liquidShareBps: number;
  /** Meses de gasto cubiertos por debajo de los cuales se avisa. */
  readonly runwayMinMonths: number;
  /** Meses de gasto cubiertos por encima de los cuales se informa. */
  readonly runwayMaxMonths: number;
}

export const DEFAULT_ADVICE_THRESHOLDS: AdviceThresholds = {
  speculativeShareBps: 500,
  institutionShareBps: 4000,
  liquidShareBps: 4000,
  runwayMinMonths: 3,
  runwayMaxMonths: 12,
};

/**
 * Qué supuesto (`assumptions.key`) edita cada umbral y entre qué valores es válido. Los
 * umbrales son de la persona (regla 19): lo que no esté definido, o no sea válido, usa el valor
 * por defecto y se informa en `ignored`.
 */
export const THRESHOLD_FIELDS = {
  speculativeShareBps: { assumptionKey: "speculative_share_bps", unit: "bps", min: 0, max: 10_000 },
  institutionShareBps: { assumptionKey: "institution_share_bps", unit: "bps", min: 0, max: 10_000 },
  liquidShareBps: { assumptionKey: "liquid_share_bps", unit: "bps", min: 0, max: 10_000 },
  runwayMinMonths: { assumptionKey: "runway_min_months", unit: "months", min: 0, max: 120 },
  runwayMaxMonths: { assumptionKey: "runway_max_months", unit: "months", min: 1, max: 600 },
} as const satisfies Record<
  keyof AdviceThresholds,
  {
    assumptionKey: string;
    unit: "bps" | "months";
    min: number;
    max: number;
  }
>;

/** Claves de `assumptions` de los umbrales de avisos. */
export const THRESHOLD_ASSUMPTION_KEYS: readonly string[] = Object.values(THRESHOLD_FIELDS).map(
  (f) => f.assumptionKey,
);

const WHOLE_NUMBER = /^\d{1,9}(?:\.0+)?$/;

/**
 * Umbrales a partir de los supuestos guardados (el más reciente de cada clave). Un valor que no es
 * un entero dentro de su rango se ignora; si los meses mínimo y máximo no cuadran (mínimo ≥
 * máximo), se ignoran los dos. Nunca lanza: los avisos siguen funcionando con los valores por defecto.
 */
export function thresholdsFrom(
  assumptions: readonly { readonly key: string; readonly value: string }[],
  defaults: AdviceThresholds = DEFAULT_ADVICE_THRESHOLDS,
): { thresholds: AdviceThresholds; ignored: readonly string[] } {
  const next: { -readonly [K in keyof AdviceThresholds]: number } = { ...defaults };
  const ignored: string[] = [];
  for (const name of Object.keys(THRESHOLD_FIELDS) as (keyof AdviceThresholds)[]) {
    const field = THRESHOLD_FIELDS[name];
    const row = assumptions.find((a) => a.key === field.assumptionKey);
    if (!row) continue;
    const value = WHOLE_NUMBER.test(row.value) ? Number(row.value.split(".")[0]) : Number.NaN;
    if (Number.isInteger(value) && value >= field.min && value <= field.max) next[name] = value;
    else ignored.push(field.assumptionKey);
  }
  if (next.runwayMinMonths >= next.runwayMaxMonths) {
    next.runwayMinMonths = defaults.runwayMinMonths;
    next.runwayMaxMonths = defaults.runwayMaxMonths;
    ignored.push(
      THRESHOLD_FIELDS.runwayMinMonths.assumptionKey,
      THRESHOLD_FIELDS.runwayMaxMonths.assumptionKey,
    );
  }
  return { thresholds: next, ignored };
}

export interface AdviceInput {
  readonly baseCurrency: CurrencyCode;
  readonly accounts: readonly AdviceAccount[];
  /** Gasto mensual que indica la persona (supuesto); `null` si aún no lo ha dado. */
  readonly monthlyExpense: Money | null;
  readonly thresholds: AdviceThresholds;
  /** Bolsillos con su valor; sin ellos no se evalúa el tope especulativo. */
  readonly pockets?: readonly AdvicePocket[];
  /** Calendario de operaciones planificadas; sin él no se avisa de las vencidas. */
  readonly schedule?: AdviceSchedule;
}

export interface Finding {
  readonly ruleId: string;
  readonly version: number;
  readonly level: 2;
  readonly severity: "info" | "attention" | "important";
  readonly messageKey: string;
  /** Valores sin formato: los sufijos `Bps` (puntos básicos) y `months` los formatea la web. */
  readonly params: Readonly<Record<string, string>>;
  readonly confidence: "high" | "medium" | "low";
  readonly inputsUsed: readonly string[];
  readonly assumptionsUsed: readonly string[];
}

/** Tipos de cuenta de disponibilidad inmediata. */
const LIQUID_KINDS: readonly string[] = ["current", "savings", "cash"];

function shareBps(part: bigint, whole: bigint): number {
  return Number((part * 10000n) / whole);
}

/** Evalúa todas las reglas y devuelve los avisos que aplican, de más a menos importantes. */
export function evaluateAdvice(input: AdviceInput): Finding[] {
  const { accounts, thresholds, baseCurrency } = input;
  const findings: Finding[] = [];
  const assets = accounts.filter((a) => a.value.minor > 0n);
  const total = assets.reduce((sum, a) => sum + a.value.minor, 0n);
  const staleCount = accounts.filter((a) => a.stale).length;
  const confidence = staleCount > 0 ? "low" : "high";

  if (total > 0n) {
    const byInstitution = new Map<string, bigint>();
    for (const a of assets) {
      if (a.institutionId) {
        byInstitution.set(
          a.institutionId,
          (byInstitution.get(a.institutionId) ?? 0n) + a.value.minor,
        );
      }
    }
    const top = [...byInstitution.values()].reduce((max, v) => (v > max ? v : max), 0n);
    const topBps = shareBps(top, total);
    if (topBps > thresholds.institutionShareBps) {
      findings.push({
        ruleId: "concentration_institution",
        version: 1,
        level: 2,
        severity: topBps > 6000 ? "important" : "attention",
        messageKey: "advice.concentration_institution",
        params: { shareBps: String(topBps), limitBps: String(thresholds.institutionShareBps) },
        confidence,
        inputsUsed: ["accounts.institution", "accounts.value"],
        assumptionsUsed: ["institution_share_bps"],
      });
    }

    const liquid = assets
      .filter((a) => LIQUID_KINDS.includes(a.kind))
      .reduce((sum, a) => sum + a.value.minor, 0n);
    const liquidBps = shareBps(liquid, total);
    if (liquidBps > thresholds.liquidShareBps) {
      findings.push({
        ruleId: "liquid_share",
        version: 1,
        level: 2,
        severity: "info",
        messageKey: "advice.liquid_share",
        params: { shareBps: String(liquidBps), limitBps: String(thresholds.liquidShareBps) },
        confidence,
        inputsUsed: ["accounts.kind", "accounts.value"],
        assumptionsUsed: ["liquid_share_bps"],
      });
    }

    if (input.pockets) {
      const speculative = input.pockets
        .filter((p) => p.riskLevel === "speculative" && p.value.minor > 0n)
        .reduce((sum, p) => sum + p.value.minor, 0n);
      const speculativeBps = shareBps(speculative, total);
      if (speculativeBps > thresholds.speculativeShareBps) {
        findings.push({
          ruleId: "speculative_cap",
          version: 1,
          level: 2,
          severity: speculativeBps > thresholds.speculativeShareBps * 2 ? "important" : "attention",
          messageKey: "advice.speculative_cap",
          params: {
            shareBps: String(speculativeBps),
            limitBps: String(thresholds.speculativeShareBps),
          },
          confidence,
          inputsUsed: ["pockets.risk_level", "pockets.value", "accounts.value"],
          assumptionsUsed: ["speculative_share_bps"],
        });
      }
    }

    const expense = input.monthlyExpense;
    if (expense && expense.currency === baseCurrency && expense.minor > 0n) {
      const months = toDecimal({ minor: liquid, currency: baseCurrency }).div(toDecimal(expense));
      const params = { months: months.toFixed(1), expense: expense.minor.toString() };
      if (months.lt(new Decimal(thresholds.runwayMinMonths))) {
        findings.push({
          ruleId: "emergency_runway",
          version: 1,
          level: 2,
          severity: months.lt(1) ? "important" : "attention",
          messageKey: "advice.runway_low",
          params: { ...params, limitMonths: String(thresholds.runwayMinMonths) },
          confidence: "medium",
          inputsUsed: ["accounts.kind", "accounts.value"],
          assumptionsUsed: ["monthly_expense", "runway_min_months"],
        });
      } else if (months.gt(new Decimal(thresholds.runwayMaxMonths))) {
        findings.push({
          ruleId: "emergency_runway",
          version: 1,
          level: 2,
          severity: "info",
          messageKey: "advice.runway_high",
          params: { ...params, limitMonths: String(thresholds.runwayMaxMonths) },
          confidence: "medium",
          inputsUsed: ["accounts.kind", "accounts.value"],
          assumptionsUsed: ["monthly_expense", "runway_max_months"],
        });
      }
    }
  }

  if (input.schedule) {
    const { onDate, pending } = input.schedule;
    const overdue = pending.filter((date) => date < onDate).sort();
    const oldest = overdue[0];
    if (oldest !== undefined) {
      const days = daysBetween(oldest, onDate);
      findings.push({
        ruleId: "planned_operation_due",
        version: 1,
        level: 2,
        severity: days > 14 ? "attention" : "info",
        messageKey: "advice.planned_due",
        params: { count: String(overdue.length), days: String(days) },
        confidence: "high",
        inputsUsed: ["planned_operations.planned_on", "planned_operations.status"],
        assumptionsUsed: [],
      });
    }
  }

  if (staleCount > 0) {
    findings.push({
      ruleId: "stale_valuations",
      version: 1,
      level: 2,
      severity: "attention",
      messageKey: "advice.stale_valuations",
      params: { count: String(staleCount) },
      confidence: "high",
      inputsUsed: ["accounts.age"],
      assumptionsUsed: [],
    });
  }

  const order = { important: 0, attention: 1, info: 2 } as const;
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}

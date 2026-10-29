import { Decimal, dec } from "./decimal";
import {
  add,
  allocate,
  fromDecimal,
  money,
  toDecimal,
  zero,
  type CurrencyCode,
  type Money,
} from "./money";
import { err, ok, type DomainError, type Result } from "./result";

export const ASSET_CLASSES = [
  "equity",
  "fixed_income",
  "cash",
  "real_estate",
  "crypto",
  "commodity",
  "mixed",
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

/** Lo que no se sabe de qué clase es: se muestra aparte, nunca se reparte al azar. */
export const UNCLASSIFIED = "unclassified";
export type ClassKey = AssetClass | typeof UNCLASSIFIED;

const FULL_BPS = 10_000;

export interface CompositionWeight {
  readonly key: AssetClass;
  readonly weightBps: number;
}

/** Algo que se posee y tiene un valor: una cuenta, una posición. Siempre en la moneda base. */
export interface Holding {
  readonly id: string;
  readonly value: Money;
  /** Reparto por clase de activo (`asset_compositions`). Lo que no sume 10.000 pb queda sin clasificar. */
  readonly composition?: readonly CompositionWeight[];
  /** Clase principal si no hay composición. Con ella se marca la calidad del dato como baja. */
  readonly fallbackClass?: AssetClass;
  /** Marcado por la persona como especulativo (peso en `speculativeShare`). */
  readonly speculative?: boolean;
}

export interface ClassTotal {
  readonly key: ClassKey;
  readonly value: Money;
  /** Parte del total, en puntos básicos (10.000 = 100 %). */
  readonly shareBps: number;
}

export interface Exposure {
  readonly total: Money;
  readonly byClass: readonly ClassTotal[];
  /** Valor de cada holding en cada clase: base de los escenarios y de la concentración por cuenta. */
  readonly byHolding: readonly {
    readonly id: string;
    readonly classes: ReadonlyMap<ClassKey, Money>;
  }[];
}

export interface RiskExplanation<M extends string> {
  readonly method: M;
  readonly currency: CurrencyCode;
  readonly assumptions: readonly string[];
  readonly quality: {
    readonly level: "complete" | "low";
    readonly notes: readonly (DomainError & { readonly holdingId?: string })[];
  };
}

export interface ExposureResult {
  readonly value: Exposure;
  readonly explanation: RiskExplanation<"risk.exposure">;
}

const shareBps = (part: Money, total: Money): number =>
  total.minor === 0n
    ? 0
    : Number((part.minor * BigInt(FULL_BPS) * 2n + total.minor) / (total.minor * 2n));

/**
 * Exposición por clase de activo. Un fondo mixto se reparte con su composición; sin ella se usa
 * su clase principal y el dato se marca como de calidad baja; sin ninguna de las dos, va a
 * «sin clasificar». El reparto no pierde ni crea unidades mínimas (`allocate`).
 */
export function exposure(
  holdings: readonly Holding[],
  currency: CurrencyCode,
): Result<ExposureResult, DomainError & { holdingId: string }> {
  const totals = new Map<ClassKey, Money>();
  const byHolding: { id: string; classes: Map<ClassKey, Money> }[] = [];
  const notes: (DomainError & { holdingId: string })[] = [];

  for (const holding of holdings) {
    if (holding.value.currency !== currency) {
      return err({ code: "risk.currency_mismatch", holdingId: holding.id });
    }
    if (holding.value.minor < 0n)
      return err({ code: "risk.negative_holding", holdingId: holding.id });

    let parts: { key: ClassKey; weight: bigint }[];
    if (holding.composition && holding.composition.length > 0) {
      const used = holding.composition.reduce((acc, c) => acc + c.weightBps, 0);
      const valid = holding.composition.every(
        (c) => Number.isInteger(c.weightBps) && c.weightBps >= 0,
      );
      if (!valid || used > FULL_BPS)
        return err({ code: "risk.invalid_composition", holdingId: holding.id });
      parts = holding.composition.map((c) => ({ key: c.key, weight: BigInt(c.weightBps) }));
      if (used < FULL_BPS) {
        parts.push({ key: UNCLASSIFIED, weight: BigInt(FULL_BPS - used) });
        notes.push({ code: "risk.composition_incomplete", holdingId: holding.id });
      }
    } else if (holding.fallbackClass) {
      parts = [{ key: holding.fallbackClass, weight: BigInt(FULL_BPS) }];
      notes.push({ code: "risk.class_from_fallback", holdingId: holding.id });
    } else {
      parts = [{ key: UNCLASSIFIED, weight: BigInt(FULL_BPS) }];
      notes.push({ code: "risk.unclassified", holdingId: holding.id });
    }

    const shares = allocate(
      holding.value,
      parts.map((p) => p.weight),
    );
    const classes = new Map<ClassKey, Money>();
    parts.forEach((p, i) => {
      const share = shares[i] as Money;
      classes.set(p.key, add(classes.get(p.key) ?? zero(currency), share));
      totals.set(p.key, add(totals.get(p.key) ?? zero(currency), share));
    });
    byHolding.push({ id: holding.id, classes });
  }

  const total = [...totals.values()].reduce((acc, m) => add(acc, m), zero(currency));
  const byClass = [...totals]
    .filter(([, value]) => value.minor !== 0n)
    // Primero por clase y después, de forma estable, por valor: el desempate queda por clase.
    .sort(([a], [b]) => a.localeCompare(b))
    .sort(([, a], [, b]) => (a.minor < b.minor ? 1 : a.minor > b.minor ? -1 : 0))
    .map(([key, value]) => ({ key, value, shareBps: shareBps(value, total) }));

  return ok({
    value: { total, byClass, byHolding },
    explanation: {
      method: "risk.exposure",
      currency,
      assumptions: ["risk.class_by_composition_or_main_class", "risk.unclassified_shown_apart"],
      quality: { level: notes.length === 0 ? "complete" : "low", notes },
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Concentración
// ---------------------------------------------------------------------------------------------

export interface Concentration {
  /** Elemento que más pesa y su parte (pb); `null` si no hay nada. */
  readonly top: { readonly key: string; readonly shareBps: number } | null;
  /** Índice de Herfindahl-Hirschman: Σ pesos² entre 0 y 1 (1 = todo en un solo elemento). */
  readonly herfindahl: Decimal;
  /** 1 / HHI: cuántos elementos de igual peso darían la misma concentración. */
  readonly effectiveCount: Decimal | null;
}

/** Concentración de una lista de pesos (por clase, cuenta, entidad o moneda). Ignora los ceros. */
export function concentration(items: readonly { key: string; value: Money }[]): Concentration {
  const positive = items.filter((i) => i.value.minor > 0n);
  const total = positive.reduce((acc, i) => acc + i.value.minor, 0n);
  if (total === 0n) return { top: null, herfindahl: new Decimal(0), effectiveCount: null };
  const top = positive.reduce((best, i) => (i.value.minor > best.value.minor ? i : best));
  const herfindahl = positive.reduce(
    (acc, i) => acc.plus(dec(i.value.minor).div(dec(total)).pow(2)),
    new Decimal(0),
  );
  return {
    top: {
      key: top.key,
      shareBps: Number((top.value.minor * BigInt(FULL_BPS) * 2n + total) / (total * 2n)),
    },
    herfindahl,
    effectiveCount: new Decimal(1).div(herfindahl),
  };
}

// ---------------------------------------------------------------------------------------------
// Escenarios de caída
// ---------------------------------------------------------------------------------------------

export interface StressInput {
  readonly exposure: Exposure;
  /** Cambio por clase, en tasa (−0,35 = −35 %). Las clases sin choque no cambian. */
  readonly shocks: Readonly<Partial<Record<ClassKey, Decimal>>>;
  /** Gasto mensual para expresar la pérdida en meses de gasto. */
  readonly monthlySpending?: Money;
}

export interface StressImpact {
  /** Variación del valor (negativa en una caída). */
  readonly total: Money;
  readonly byHolding: readonly { readonly id: string; readonly impact: Money }[];
  readonly valueAfter: Money;
  /** Meses de gasto que equivale la pérdida; `null` sin gasto conocido o sin pérdida. */
  readonly monthsOfSpending: Decimal | null;
}

export interface StressResult {
  readonly value: StressImpact;
  readonly explanation: RiskExplanation<"risk.stress"> & {
    readonly unshocked: readonly ClassKey[];
  };
}

/**
 * Impacto de un escenario hipotético: Σ valor de cada clase × su choque. Sin correlaciones
 * (cada clase cae lo que se indica, no más ni menos) y sin previsión: es una hipótesis.
 */
export function stressScenario(input: StressInput): Result<StressResult, DomainError> {
  const { exposure: e, shocks, monthlySpending } = input;
  const currency = e.total.currency;
  if (monthlySpending && monthlySpending.currency !== currency) {
    return err({ code: "risk.currency_mismatch" });
  }
  if (Object.values(shocks).some((s) => s.lt(-1))) return err({ code: "risk.invalid_shock" });

  const byHolding = e.byHolding.map(({ id, classes }) => {
    let impact = zero(currency);
    for (const [key, value] of classes) {
      const shock = shocks[key];
      if (shock) impact = add(impact, fromDecimal(toDecimal(value).mul(shock), currency));
    }
    return { id, impact };
  });
  const total = byHolding.reduce((acc, h) => add(acc, h.impact), zero(currency));
  const months =
    monthlySpending && monthlySpending.minor > 0n && total.minor < 0n
      ? dec(-total.minor).div(dec(monthlySpending.minor))
      : null;
  const unshocked = e.byClass.map((c) => c.key).filter((key) => !shocks[key]);

  return ok({
    value: {
      total,
      byHolding,
      valueAfter: add(e.total, total),
      monthsOfSpending: months,
    },
    explanation: {
      method: "risk.stress",
      currency,
      assumptions: ["risk.stress_hypothetical_not_forecast", "risk.stress_no_correlations"],
      quality: { level: "complete", notes: [] },
      unshocked,
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Parte especulativa
// ---------------------------------------------------------------------------------------------

export interface SpeculativeShare {
  readonly value: Money;
  readonly shareBps: number;
}

/** Peso de lo que la persona ha marcado como especulativo (cripto, apuestas concretas…). */
export function speculativeShare(
  holdings: readonly Holding[],
  currency: CurrencyCode,
): SpeculativeShare {
  let flagged = zero(currency);
  let total = zero(currency);
  for (const h of holdings) {
    total = add(total, h.value);
    if (h.speculative) flagged = add(flagged, h.value);
  }
  return { value: money(flagged.minor, currency), shareBps: shareBps(flagged, total) };
}

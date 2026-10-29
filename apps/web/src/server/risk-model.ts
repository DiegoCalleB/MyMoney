import {
  addDays,
  calendarDate,
  dec,
  concentration,
  exposure,
  money,
  speculativeShare,
  stressScenario,
  type AssetClass,
  type CalendarDate,
  type Concentration,
  type CurrencyCode,
  type Decimal,
  type ExposureResult,
  type Holding,
  type Money,
  type NetWorthResult,
  type SpeculativeShare,
  type StressResult,
  isCalendarDate,
  isCurrencyCode,
} from "@mymoney/finance-core";
import { COMPOSITION_CLASSES, type AccountKind } from "@mymoney/schemas";
import { z } from "zod";
import { bigintValue, type AccountMeta } from "@/server/home-model";

const dateText = z
  .string()
  .refine(isCalendarDate)
  .transform((d) => calendarDate(d));

export const compositionRow = z.object({
  account_id: z.uuid(),
  asset_class: z.enum(COMPOSITION_CLASSES),
  weight_bps: z.number().int(),
});

export const cashflowRow = z.object({
  month: dateText,
  currency: z.string().refine(isCurrencyCode),
  income_minor: bigintValue,
  expense_minor: bigintValue,
});

/** Escenarios hipotéticos (no son previsiones). Cambios por clase de activo, sin correlaciones. */
export const SCENARIOS = [
  { id: "moderate", shocks: { equity: dec("-0.2"), crypto: dec("-0.4") } },
  { id: "strong", shocks: { equity: dec("-0.35"), crypto: dec("-0.7"), real_estate: dec("-0.1") } },
  {
    id: "crisis",
    shocks: {
      equity: dec("-0.5"),
      crypto: dec("-0.8"),
      real_estate: dec("-0.2"),
      commodity: dec("-0.2"),
    },
  },
] as const;
export type ScenarioId = (typeof SCENARIOS)[number]["id"];

/**
 * Clase por defecto según el tipo de cuenta. Un broker, un fondo o un plan de pensiones pueden
 * contener de todo: se muestran como «mixto» (calidad baja) hasta que la persona ajuste el reparto.
 * Un vehículo u «otro bien» no tiene clase por defecto: queda sin clasificar.
 */
export function defaultClass(kind: AccountKind): AssetClass | undefined {
  switch (kind) {
    case "current":
    case "savings":
    case "deposit":
    case "cash":
      return "cash";
    case "crypto":
      return "crypto";
    case "real_estate":
      return "real_estate";
    case "brokerage":
    case "fund_holding":
    case "pension_plan":
      return "mixed";
    default:
      return undefined;
  }
}

/** Meses completos anteriores al actual sobre los que se promedia el gasto. */
const SPENDING_MONTHS = 3;

/** Del primer día del mes `SPENDING_MONTHS` atrás hasta el último día del mes anterior. */
export function spendingWindow(today: CalendarDate): { from: CalendarDate; to: CalendarDate } {
  const firstOfMonth = calendarDate(`${today.slice(0, 7)}-01`);
  const to = addDays(firstOfMonth, -1);
  let from = firstOfMonth;
  for (let i = 0; i < SPENDING_MONTHS; i++)
    from = calendarDate(`${addDays(from, -1).slice(0, 7)}-01`);
  return { from, to };
}

/** Gasto mensual medio (en la moneda base) de los meses con gasto; `null` si no hay ninguno. */
export function averageMonthlySpending(
  rows: readonly z.infer<typeof cashflowRow>[],
  currency: CurrencyCode,
): Money | null {
  const months = rows.filter((r) => r.currency === currency && r.expense_minor > 0n);
  if (months.length === 0) return null;
  const total = months.reduce((acc, r) => acc + r.expense_minor, 0n);
  const n = BigInt(months.length);
  return money((total * 2n + n) / (n * 2n), currency);
}

export interface RiskScenario {
  readonly id: ScenarioId;
  readonly shocks: Readonly<Record<string, Decimal>>;
  readonly result: StressResult | null;
}

export interface RiskModel {
  readonly currency: CurrencyCode;
  readonly exposure: ExposureResult | null;
  readonly byAccount: Concentration;
  readonly byClass: Concentration;
  readonly speculative: SpeculativeShare;
  readonly monthlySpending: Money | null;
  readonly scenarios: readonly RiskScenario[];
  /** Cuentas que se pueden ajustar a mano (las que no tienen una clase única evidente). */
  readonly editable: readonly string[];
  readonly names: ReadonlyMap<string, string>;
}

export interface RiskInput {
  readonly netWorth: NetWorthResult;
  readonly accounts: ReadonlyMap<string, AccountMeta>;
  readonly compositions: readonly z.infer<typeof compositionRow>[];
  readonly cashflow: readonly z.infer<typeof cashflowRow>[];
}

/** Exposición, concentración y escenarios a partir del mismo cálculo de patrimonio de la pantalla de inicio. */
export function buildRisk(input: RiskInput): RiskModel {
  const currency = input.netWorth.value.total.currency;
  const holdings: Holding[] = [];
  const names = new Map<string, string>();
  const editable: string[] = [];
  for (const line of input.netWorth.explanation.accounts) {
    const meta = input.accounts.get(line.accountId);
    // Las deudas no son exposición; una cuenta en descubierto tampoco.
    if (!meta || line.contribution.minor <= 0n) continue;
    const composition = input.compositions
      .filter((c) => c.account_id === line.accountId)
      .map((c) => ({ key: c.asset_class, weightBps: c.weight_bps }));
    const fallback = defaultClass(meta.kind);
    holdings.push({
      id: line.accountId,
      value: line.contribution,
      ...(composition.length > 0 ? { composition } : {}),
      ...(fallback ? { fallbackClass: fallback } : {}),
      ...(meta.kind === "crypto" ? { speculative: true } : {}),
    });
    names.set(line.accountId, meta.name);
    if (fallback === "mixed" || fallback === undefined) editable.push(line.accountId);
  }

  const result = exposure(holdings, currency);
  const computed = result.ok ? result.value : null;
  const monthlySpending = averageMonthlySpending(input.cashflow, currency);
  const scenarios: RiskScenario[] = SCENARIOS.map((s) => {
    const stress = computed
      ? stressScenario({
          exposure: computed.value,
          shocks: s.shocks,
          ...(monthlySpending ? { monthlySpending } : {}),
        })
      : null;
    return { id: s.id, shocks: s.shocks, result: stress?.ok ? stress.value : null };
  });

  return {
    currency,
    exposure: computed,
    byAccount: concentration(holdings.map((h) => ({ key: h.id, value: h.value }))),
    byClass: concentration(
      (computed?.value.byClass ?? []).map((c) => ({ key: c.key, value: c.value })),
    ),
    speculative: speculativeShare(holdings, currency),
    monthlySpending,
    scenarios,
    editable,
    names,
  };
}

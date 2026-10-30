import { Decimal, dec } from "./decimal";
import { fromDecimal, money, sum, toDecimal, type Money } from "./money";
import { err, ok, type DomainError, type Result } from "./result";

/**
 * Cifras para el asistente educativo (ADR-0025, nivel 1-2): hechos sobre el patrimonio de la
 * propia persona y escenarios ilustrativos. Nada de esto es una previsión ni una recomendación:
 * el asistente solo las explica, y los supuestos van siempre a la vista.
 */
const FULL_BPS = 10_000n;

/** Caídas de la parte de riesgo con las que se ilustra el aguante del patrimonio. */
export const STRESS_DROPS_BPS = [1000, 2000, 3000, 5000] as const;

export interface ProfileFactsInput {
  /** Patrimonio neto (tu parte). */
  readonly total: Money;
  /** Parte disponible de inmediato: efectivo, cuentas corrientes y de ahorro. */
  readonly liquid: Money;
  /** Parte en activos que suben y bajan: brokers, fondos y cripto. */
  readonly risk: Money;
  /** Gasto mensual supuesto o medido; `null` si no se conoce. */
  readonly monthlyExpense: Money | null;
}

export interface StressScenario {
  /** Caída supuesta de la parte de riesgo, en puntos básicos. */
  readonly dropBps: number;
  readonly loss: Money;
  /** Pérdida sobre el patrimonio total, en puntos básicos; `null` si el patrimonio no es positivo. */
  readonly lossShareBps: number | null;
}

export interface ProfileFacts {
  /** Parte del patrimonio en activos de riesgo (puntos básicos); `null` si no hay patrimonio. */
  readonly riskShareBps: number | null;
  /** Meses de gasto que cubre lo disponible de inmediato, en décimas; `null` sin gasto conocido. */
  readonly liquidityMonthsTenths: bigint | null;
  readonly stress: readonly StressScenario[];
}

export interface ProfileFactsExplanation {
  readonly method: "profile_facts.share_liquidity_stress";
  readonly inputs: readonly string[];
  readonly assumptions: readonly string[];
  readonly dataQuality: "high" | "low";
}

/** Reparto, cobertura de gastos y prueba de resistencia sencilla del patrimonio. */
export function profileFacts(input: ProfileFactsInput): {
  readonly value: ProfileFacts;
  readonly explanation: ProfileFactsExplanation;
} {
  const { total, liquid, risk, monthlyExpense } = input;
  // Lanza si las monedas no coinciden: nada se suma sin conversión explícita.
  sum([liquid, risk, ...(monthlyExpense ? [monthlyExpense] : [])], total.currency);

  const positive = total.minor > 0n;
  const stress = STRESS_DROPS_BPS.map((dropBps): StressScenario => {
    const loss = money((risk.minor * BigInt(dropBps)) / FULL_BPS, risk.currency);
    return {
      dropBps,
      loss,
      lossShareBps: positive ? Number((loss.minor * FULL_BPS) / total.minor) : null,
    };
  });
  return {
    value: {
      riskShareBps: positive ? Number((risk.minor * FULL_BPS) / total.minor) : null,
      liquidityMonthsTenths:
        monthlyExpense && monthlyExpense.minor > 0n
          ? (liquid.minor * 10n) / monthlyExpense.minor
          : null,
      stress,
    },
    explanation: {
      method: "profile_facts.share_liquidity_stress",
      inputs: ["net_worth.total", "accounts.kind", "expense.monthly"],
      assumptions: [
        "profile_facts.risk_is_brokerage_fund_crypto",
        "profile_facts.liquid_is_cash_current_savings",
        "profile_facts.stress_is_illustrative_not_forecast",
      ],
      dataQuality: positive && monthlyExpense !== null ? "high" : "low",
    },
  };
}

export type PathScenarioId = "steady_rise" | "flat" | "dip_and_recover" | "steady_fall";

export interface PathScenario {
  readonly id: PathScenarioId;
  /** Valor final aportando todo al principio. */
  readonly lump: Money;
  /** Valor final aportando a partes iguales cada mes. */
  readonly periodic: Money;
}

export interface InvestPathInput {
  readonly amount: Money;
  /** Meses del plan de aportaciones periódicas (2-60). */
  readonly months: number;
  /** Rentabilidad anual supuesta en el escenario de subida constante, en puntos básicos. */
  readonly annualReturnBps: number;
  /** Caída supuesta en los escenarios a la baja, en puntos básicos. */
  readonly dropBps: number;
}

export interface InvestPathExplanation {
  readonly method: "invest_paths.deterministic_scenarios";
  readonly assumptions: readonly string[];
  readonly months: number;
  readonly annualReturnBps: number;
  readonly dropBps: number;
}

const ONE = new Decimal(1);

function priceAt(id: PathScenarioId, t: number, months: number, input: InvestPathInput): Decimal {
  const drop = dec(BigInt(input.dropBps)).div(10_000);
  switch (id) {
    case "steady_rise":
      return ONE.add(dec(BigInt(input.annualReturnBps)).div(10_000)).pow(dec(BigInt(t)).div(12));
    case "flat":
      return ONE;
    case "steady_fall":
      return ONE.sub(drop.mul(dec(BigInt(t))).div(months));
    case "dip_and_recover": {
      // Triángulo: baja hasta la mitad del plan y vuelve al precio de partida al final.
      const triangle = dec(BigInt(Math.min(t, months - t) * 2)).div(months);
      return ONE.sub(drop.mul(triangle));
    }
  }
}

const SCENARIOS: readonly PathScenarioId[] = [
  "steady_rise",
  "flat",
  "dip_and_recover",
  "steady_fall",
];

/**
 * Compara aportar todo hoy con aportar a partes iguales cada mes, en cuatro caminos ilustrativos
 * del precio (sube, plano, baja y recupera, baja). No son previsiones: enseñan que cuál sale
 * mejor depende de lo que haga el mercado, que nadie sabe de antemano. Sin comisiones ni
 * impuestos; el dinero que espera su turno no rinde nada.
 */
export function investPathScenarios(
  input: InvestPathInput,
): Result<
  { readonly value: readonly PathScenario[]; readonly explanation: InvestPathExplanation },
  DomainError
> {
  const { amount, months, annualReturnBps, dropBps } = input;
  if (amount.minor <= 0n) return err({ code: "assistant.amount_invalid" });
  if (!Number.isInteger(months) || months < 2 || months > 60) {
    return err({ code: "assistant.months_invalid" });
  }
  if (!Number.isInteger(annualReturnBps) || annualReturnBps < -5000 || annualReturnBps > 5000) {
    return err({ code: "assistant.return_invalid" });
  }
  if (!Number.isInteger(dropBps) || dropBps < 0 || dropBps > 9000) {
    return err({ code: "assistant.drop_invalid" });
  }

  const total = toDecimal(amount);
  const part = total.div(months);
  const value = SCENARIOS.map((id): PathScenario => {
    const end = priceAt(id, months, months, input);
    let units = new Decimal(0);
    for (let t = 0; t < months; t += 1) units = units.add(part.div(priceAt(id, t, months, input)));
    return {
      id,
      // Todo al principio: el precio de partida es 1.
      lump: fromDecimal(total.mul(end), amount.currency),
      periodic: fromDecimal(units.mul(end), amount.currency),
    };
  });
  return ok({
    value,
    explanation: {
      method: "invest_paths.deterministic_scenarios",
      assumptions: [
        "invest_paths.scenarios_are_not_forecasts",
        "invest_paths.waiting_cash_earns_nothing",
        "invest_paths.no_costs_no_taxes",
      ],
      months,
      annualReturnBps,
      dropBps,
    },
  });
}

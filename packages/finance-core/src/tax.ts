import { dec, type Decimal } from "./decimal";
import {
  add,
  compare,
  fromDecimal,
  sub,
  toDecimal,
  zero,
  type CurrencyCode,
  type Money,
} from "./money";
import { err, ok, type DomainError, type Result } from "./result";

/**
 * Fiscalidad informativa (España, pero parametrizada): ninguna cifra legal vive aquí. Los tramos
 * y límites llegan como parámetros, cada uno con su fuente y su fecha de verificación (ADR-0019,
 * `ref.tax_parameters`), y las explicaciones los repiten. Son estimaciones sobre datos de la
 * propia persona: no determinan ninguna obligación ni sustituyen a una gestoría.
 */

/** Fuente de un parámetro legal: se muestra junto a cada cifra que lo usa. */
export interface ParameterSource {
  readonly fiscalYear: number;
  readonly sourceUrl: string;
  /** Fecha (AAAA-MM-DD) en que alguien comprobó el valor contra la fuente. */
  readonly verifiedOn: string;
}

/** Tramo de una escala progresiva: `upTo` es el límite superior del tramo (`null` = sin límite). */
export interface TaxBracket {
  readonly upTo: Money | null;
  /** Tipo del tramo como decimal (0,19 = 19 %). */
  readonly rate: Decimal;
}

export interface BracketAmount {
  readonly rate: Decimal;
  /** Parte de la ganancia que cae en el tramo. */
  readonly base: Money;
  readonly tax: Money;
}

export interface SavingsTax {
  readonly tax: Money;
  /** Cuota / ganancia; `null` si no hay ganancia. */
  readonly effectiveRate: Decimal | null;
  readonly byBracket: readonly BracketAmount[];
}

export interface SavingsTaxExplanation {
  readonly method: "tax.savings_progressive";
  readonly source: ParameterSource;
  readonly caveats: readonly string[];
}

export interface SavingsTaxResult {
  readonly value: SavingsTax;
  readonly explanation: SavingsTaxExplanation;
}

function validBrackets(brackets: readonly TaxBracket[], currency: CurrencyCode): boolean {
  if (brackets.length === 0) return false;
  let previous = zero(currency);
  return brackets.every((bracket, i) => {
    const last = i === brackets.length - 1;
    if (bracket.rate.isNaN() || bracket.rate.isNegative() || bracket.rate.gt(1)) return false;
    if (bracket.upTo === null) return last;
    if (last || bracket.upTo.currency !== currency || compare(bracket.upTo, previous) <= 0) {
      return false;
    }
    previous = bracket.upTo;
    return true;
  });
}

/**
 * Cuota de la base del ahorro sobre una ganancia, con una escala progresiva dada. Una pérdida no
 * paga (la compensación de pérdidas entre operaciones no se modela y se dice). Un único redondeo,
 * al céntimo, por tramo.
 */
export function savingsTax(
  gain: Money,
  brackets: readonly TaxBracket[],
  source: ParameterSource,
): Result<SavingsTaxResult, DomainError> {
  const currency = gain.currency;
  if (!validBrackets(brackets, currency)) return err({ code: "tax.brackets_invalid" });
  const caveats = ["tax.caveat.losses_not_offset", "tax.caveat.estimate"];

  let remaining = gain.minor > 0n ? gain : zero(currency);
  let floor = zero(currency);
  let total = zero(currency);
  const byBracket: BracketAmount[] = [];
  for (const bracket of brackets) {
    const width = bracket.upTo === null ? remaining : sub(bracket.upTo, floor);
    const base = compare(remaining, width) < 0 ? remaining : width;
    const tax = fromDecimal(toDecimal(base).mul(bracket.rate), currency);
    byBracket.push({ rate: bracket.rate, base, tax });
    total = add(total, tax);
    remaining = sub(remaining, base);
    if (bracket.upTo !== null) floor = bracket.upTo;
  }
  return ok({
    value: {
      tax: total,
      effectiveRate: gain.minor > 0n ? toDecimal(total).div(toDecimal(gain)) : null,
      byBracket,
    },
    explanation: { method: "tax.savings_progressive", source, caveats },
  });
}

export interface PensionRoomInput {
  /** Límite anual de aportación del ejercicio (parámetro legal con su fuente). */
  readonly limit: Money;
  /** Aportaciones del ejercicio a planes de pensiones (solo entradas; las retiradas no restan). */
  readonly contributed: Money;
  readonly source: ParameterSource;
}

export interface PensionRoom {
  readonly limit: Money;
  readonly contributed: Money;
  /** Lo que queda hasta el límite (cero si ya se alcanzó o superó). */
  readonly remaining: Money;
  /** Lo aportado por encima del límite (cero si no se superó). */
  readonly excess: Money;
  /** Lo aportado / el límite; `null` si el límite es cero. */
  readonly fractionUsed: Decimal | null;
}

export interface PensionRoomResult {
  readonly value: PensionRoom;
  readonly explanation: {
    readonly method: "tax.pension_limit";
    readonly source: ParameterSource;
    readonly caveats: readonly string[];
  };
}

/**
 * Margen de aportación a planes de pensiones en el ejercicio: límite − aportado. El límite
 * real puede tener sublímites (p. ej., el de las aportaciones de la empresa) que aquí no se
 * separan, y la explicación lo avisa.
 */
export function pensionRoom(input: PensionRoomInput): Result<PensionRoomResult, DomainError> {
  const { limit, contributed } = input;
  if (limit.currency !== contributed.currency) return err({ code: "tax.currency_mismatch" });
  if (limit.minor < 0n || contributed.minor < 0n) return err({ code: "tax.negative_amount" });
  const cmp = compare(contributed, limit);
  const currency = limit.currency;
  return ok({
    value: {
      limit,
      contributed,
      remaining: cmp < 0 ? sub(limit, contributed) : zero(currency),
      excess: cmp > 0 ? sub(contributed, limit) : zero(currency),
      fractionUsed: limit.minor === 0n ? null : toDecimal(contributed).div(toDecimal(limit)),
    },
    explanation: {
      method: "tax.pension_limit",
      source: input.source,
      caveats: ["tax.caveat.employer_limit_not_split", "tax.caveat.estimate"],
    },
  });
}

export interface TransferVsSaleInput {
  /** Valor actual de la posición. */
  readonly value: Money;
  /** Lo aportado (coste de adquisición), a nivel de cuenta: una aproximación. */
  readonly costBasis: Money;
  readonly brackets: readonly TaxBracket[];
  readonly source: ParameterSource;
  /** Coste anual (TER) del producto actual y del de destino, en puntos básicos. */
  readonly currentTerBps: number;
  readonly targetTerBps: number;
}

export interface TransferOption {
  /** Impuesto a pagar ahora. */
  readonly taxNow: Money;
  /** Dinero que sigue invertido tras la operación. */
  readonly invested: Money;
  /** Ahorro anual de comisiones frente a quedarse como está (negativo si cuesta más). */
  readonly annualFeeSaving: Money;
}

export interface TransferVsSale {
  readonly gain: Money;
  readonly transfer: TransferOption;
  readonly sale: TransferOption;
  /** Años de ahorro de comisiones que tarda la venta en compensar el impuesto; `null` si no compensa. */
  readonly saleBreakEvenYears: Decimal | null;
}

export interface TransferVsSaleResult {
  readonly value: TransferVsSale;
  readonly explanation: {
    readonly method: "tax.transfer_vs_sale";
    readonly source: ParameterSource;
    readonly assumptions: readonly string[];
    readonly caveats: readonly string[];
  };
}

const BPS = dec("10000");

/**
 * Compara, con los datos que escribe la persona, trasladar una posición (traspaso, que no
 * tributa en el momento) con venderla (que tributa la ganancia) para pasar a otro producto de
 * distinto coste. Es una estimación con supuestos visibles: costes constantes, sin rentabilidad,
 * ganancia calculada a nivel de cuenta y sin la regla de recompra. No dice qué hacer.
 */
export function transferVsSale(
  input: TransferVsSaleInput,
): Result<TransferVsSaleResult, DomainError> {
  const { value, costBasis } = input;
  if (value.currency !== costBasis.currency) return err({ code: "tax.currency_mismatch" });
  if (value.minor < 0n || costBasis.minor < 0n) return err({ code: "tax.negative_amount" });
  if (
    !Number.isInteger(input.currentTerBps) ||
    !Number.isInteger(input.targetTerBps) ||
    input.currentTerBps < 0 ||
    input.targetTerBps < 0 ||
    input.currentTerBps > 10_000 ||
    input.targetTerBps > 10_000
  ) {
    return err({ code: "tax.ter_invalid" });
  }
  const currency = value.currency;
  const gain = sub(value, costBasis);
  const tax = savingsTax(gain, input.brackets, input.source);
  if (!tax.ok) return tax;

  // Ahorro anual = diferencia de coste (en puntos básicos) aplicada al dinero que de verdad cambia
  // de producto. Comparar comisiones absolutas sería engañoso: tras vender queda menos capital.
  const diffBps = dec(String(input.currentTerBps - input.targetTerBps));
  const savingOn = (invested: Money) =>
    fromDecimal(toDecimal(invested).mul(diffBps).div(BPS), currency);
  const afterSale = sub(value, tax.value.value.tax);
  const transfer: TransferOption = {
    taxNow: zero(currency),
    invested: value,
    annualFeeSaving: savingOn(value),
  };
  const sale: TransferOption = {
    taxNow: tax.value.value.tax,
    invested: afterSale,
    annualFeeSaving: savingOn(afterSale),
  };
  const annualSaving = toDecimal(sale.annualFeeSaving);
  const saleBreakEvenYears =
    sale.taxNow.minor === 0n
      ? dec("0")
      : annualSaving.gt(0)
        ? toDecimal(sale.taxNow).div(annualSaving)
        : null;

  return ok({
    value: { gain, transfer, sale, saleBreakEvenYears },
    explanation: {
      method: "tax.transfer_vs_sale",
      source: input.source,
      assumptions: [
        "tax.assumption.constant_fees",
        "tax.assumption.no_returns",
        "tax.assumption.gain_at_account_level",
        "tax.assumption.transfer_defers_tax",
        "tax.assumption.no_wash_sale",
      ],
      caveats: [...tax.value.explanation.caveats],
    },
  });
}

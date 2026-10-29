import { daysBetween, type CalendarDate } from "./calendar-date";
import { dec, type Decimal } from "./decimal";
import { allocate, money, type CurrencyCode, type Money } from "./money";
import { err, ok, type DomainError, type Result } from "./result";

/** Un peso de la composición publicada de un activo en una fecha (en puntos básicos: 10000 = 100 %). */
export interface CompositionRow {
  readonly asOf: CalendarDate;
  readonly key: string;
  readonly weightBps: number;
}

export interface ExposurePosition {
  readonly assetId: string;
  /** Valor de la posición ya en la moneda del cálculo (regla 14: la conversión es del llamante). */
  readonly value: Money;
  /** Filas de la dimensión pedida, de cualquier fecha; se usa la última no posterior a `onDate`. */
  readonly composition: readonly CompositionRow[];
}

export interface ExposureInput {
  /** Qué se mide: región, sector, clase de activo, divisa… Solo etiqueta la explicación. */
  readonly dimension: string;
  readonly currency: CurrencyCode;
  readonly positions: readonly ExposurePosition[];
  /** "Hoy" en la zona del espacio: la librería no lee el reloj. */
  readonly onDate: CalendarDate;
}

export interface ExposureBucket {
  readonly key: string;
  readonly amount: Money;
  /** Parte del total de las posiciones (0,25 = 25 %). */
  readonly share: Decimal;
}

export interface Exposure {
  readonly total: Money;
  /** De mayor a menor importe; los empates, por clave. */
  readonly buckets: readonly ExposureBucket[];
  /** Lo que no se sabe repartir: posiciones sin composición y el resto de composiciones parciales. */
  readonly unclassified: Money;
  /** Parte del total que sí está repartida; `null` si el total es cero. */
  readonly coverage: Decimal | null;
}

export interface ExposureExplanation {
  readonly method: "exposure.look_through";
  readonly dimension: string;
  readonly positionCount: number;
  /** Activos sin ninguna composición publicada hasta `onDate`. */
  readonly withoutData: readonly string[];
  /** Códigos estables (i18n) de lo que limita la fiabilidad del resultado. */
  readonly caveats: readonly string[];
}

export interface ExposureResult {
  readonly value: Exposure;
  readonly explanation: ExposureExplanation;
}

const FULL_BPS = 10_000;
/** Una composición más antigua que esto se señala como posiblemente desfasada. */
const STALE_DAYS = 400;

/**
 * Exposición real de una cartera mirando dentro de los fondos (look-through): reparte el valor de
 * cada posición según la última composición publicada y suma por clave. Nunca supone lo que no
 * sabe: lo que falta queda como «sin clasificar» y se dice. El reparto es exacto (método del
 * resto mayor), así que clasificado + sin clasificar = total, al céntimo.
 */
export function exposure(input: ExposureInput): Result<ExposureResult, DomainError> {
  const { currency, onDate } = input;
  const totals = new Map<string, bigint>();
  let unclassified = 0n;
  let total = 0n;
  const withoutData: string[] = [];
  let partial = false;
  let stale = false;

  for (const position of input.positions) {
    if (position.value.currency !== currency) {
      return err({ code: "exposure.currency_mismatch", params: { assetId: position.assetId } });
    }
    if (position.value.minor < 0n) {
      return err({ code: "exposure.negative_value", params: { assetId: position.assetId } });
    }
    total += position.value.minor;

    const known = position.composition.filter((row) => row.asOf <= onDate);
    const asOf = known.reduce<CalendarDate | null>(
      (latest, row) => (latest === null || row.asOf > latest ? row.asOf : latest),
      null,
    );
    if (asOf === null) {
      withoutData.push(position.assetId);
      unclassified += position.value.minor;
      continue;
    }
    if (daysBetween(asOf, onDate) > STALE_DAYS) stale = true;

    // Las filas repetidas de una misma clave se suman.
    const weights = new Map<string, number>();
    for (const row of known.filter((r) => r.asOf === asOf)) {
      weights.set(row.key, (weights.get(row.key) ?? 0) + row.weightBps);
    }
    const keys = [...weights.keys()].sort();
    const bps = keys.map((key) => weights.get(key) as number);
    const weightSum = bps.reduce((a, b) => a + b, 0);
    if (weightSum > FULL_BPS || bps.some((w) => w < 0 || !Number.isInteger(w))) {
      return err({ code: "exposure.invalid_weights", params: { assetId: position.assetId } });
    }
    if (weightSum < FULL_BPS) partial = true;

    // El último peso es lo que la composición no cubre.
    const parts = allocate(position.value, [...bps.map(BigInt), BigInt(FULL_BPS - weightSum)]);
    keys.forEach((key, i) => {
      totals.set(key, (totals.get(key) ?? 0n) + (parts[i] as Money).minor);
    });
    unclassified += (parts[keys.length] as Money).minor;
  }

  const totalMoney = money(total, currency);
  const share = (minor: bigint) => (total === 0n ? dec("0") : dec(minor).div(dec(total)));
  const buckets = [...totals.entries()]
    .map(([key, minor]) => ({ key, amount: money(minor, currency), share: share(minor) }))
    .sort((a, b) =>
      a.amount.minor === b.amount.minor
        ? a.key < b.key
          ? -1
          : 1
        : a.amount.minor > b.amount.minor
          ? -1
          : 1,
    );
  const caveats: string[] = [];
  if (withoutData.length > 0) caveats.push("exposure.caveat.missing_composition");
  if (partial) caveats.push("exposure.caveat.partial_composition");
  if (stale) caveats.push("exposure.caveat.old_composition");

  return ok({
    value: {
      total: totalMoney,
      buckets,
      unclassified: money(unclassified, currency),
      coverage: total === 0n ? null : dec(total - unclassified).div(dec(total)),
    },
    explanation: {
      method: "exposure.look_through",
      dimension: input.dimension,
      positionCount: input.positions.length,
      withoutData,
      caveats,
    },
  });
}

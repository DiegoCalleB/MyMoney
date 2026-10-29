import {
  exposure,
  type AccountLine,
  type CalendarDate,
  type CurrencyCode,
  type DomainError,
  type ExposureResult,
  type Result,
} from "@mymoney/finance-core";
import { isCalendarDate, calendarDate } from "@mymoney/finance-core";
import type { AccountKind } from "@mymoney/schemas";
import { z } from "zod";

export const EXPOSURE_DIMENSIONS = ["asset_class", "region", "currency", "sector"] as const;
export type ExposureDimension = (typeof EXPOSURE_DIMENSIONS)[number];

export function isDimension(value: string | undefined): value is ExposureDimension {
  return EXPOSURE_DIMENSIONS.some((d) => d === value);
}

/** Cuentas cuya composición tiene sentido declarar: fondos, planes, bróker y cripto. */
export const COMPOSITION_KINDS: ReadonlySet<AccountKind> = new Set([
  "fund_holding",
  "pension_plan",
  "brokerage",
  "crypto",
]);

export const compositionRow = z.object({
  asset_id: z.uuid(),
  as_of: z.string().refine(isCalendarDate).transform(calendarDate),
  key: z.string(),
  weight_bps: z.number().int(),
});
export type CompositionDbRow = z.infer<typeof compositionRow>;

export interface ExposureAccount {
  readonly id: string;
  readonly name: string;
  readonly kind: AccountKind;
  readonly primaryAssetId: string | null;
}

export interface ExposureModel {
  readonly result: Result<ExposureResult, DomainError>;
  /** Cuentas elegibles sin composición de esta dimensión (para invitar a declararla). */
  readonly undeclared: readonly ExposureAccount[];
}

/**
 * Exposición del hogar por una dimensión: cada cuenta de inversión es una posición con el valor
 * que ya muestra el patrimonio (en moneda base) y la composición del activo que declaró la
 * persona. Una cuenta sin activo o sin composición queda «sin clasificar».
 */
export function buildExposure(
  accounts: readonly ExposureAccount[],
  lines: readonly AccountLine[],
  compositions: readonly CompositionDbRow[],
  dimension: ExposureDimension,
  base: CurrencyCode,
  today: CalendarDate,
): ExposureModel {
  const eligible = accounts.filter((a) => COMPOSITION_KINDS.has(a.kind));
  const values = new Map(lines.map((l) => [l.accountId, l.contribution]));
  const positions = eligible.flatMap((a) => {
    const value = values.get(a.id);
    if (!value || value.minor <= 0n) return [];
    return [
      {
        assetId: a.id,
        value,
        composition: compositions
          .filter((c) => a.primaryAssetId !== null && c.asset_id === a.primaryAssetId)
          .map((c) => ({ asOf: c.as_of, key: c.key, weightBps: c.weight_bps })),
      },
    ];
  });
  const result = exposure({ dimension, currency: base, positions, onDate: today });
  const withData = new Set(
    result.ok ? positions.filter((p) => p.composition.length > 0).map((p) => p.assetId) : [],
  );
  return {
    result,
    undeclared: eligible.filter((a) => values.has(a.id) && !withData.has(a.id)),
  };
}

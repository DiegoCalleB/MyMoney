import DecimalJs from "decimal.js";

/**
 * Decimal configurado para el dominio (ADR-0005): 34 dígitos significativos y redondeo
 * bancario. Es un clon aislado: cambiar la configuración global de decimal.js no le afecta.
 */
export const Decimal = DecimalJs.clone({
  precision: 34,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Decimal = InstanceType<typeof Decimal>;

/** Modos de redondeo permitidos al pasar a unidades mínimas. */
export type RoundingMode = "HALF_EVEN" | "HALF_UP";

export const ROUNDING: Readonly<Record<RoundingMode, DecimalJs.Rounding>> = {
  HALF_EVEN: DecimalJs.ROUND_HALF_EVEN,
  // ROUND_HALF_UP de decimal.js redondea alejándose de cero, que es lo que espera el usuario.
  HALF_UP: DecimalJs.ROUND_HALF_UP,
};

/** Construye un Decimal solo desde cadenas o bigint: nunca desde `number` (coma flotante). */
export function dec(value: string | bigint): Decimal {
  return new Decimal(typeof value === "bigint" ? value.toString() : value);
}

import { formatMoney } from "@/lib/format";
import type { Money } from "@mymoney/finance-core";

/**
 * Importe que se puede ocultar con el modo privado (CSS sobre `[data-privacy="hidden"]`). Los
 * porcentajes no usan este componente: siguen visibles.
 */
export function Amount({
  value,
  signed = false,
}: {
  readonly value: Money;
  /** Antepone «+» a los importes positivos (para ganancias). */
  readonly signed?: boolean;
}) {
  return (
    <span className="amount">
      {signed && value.minor > 0n ? "+" : ""}
      {formatMoney(value)}
    </span>
  );
}

import { formatMoney } from "@/lib/format";
import type { Money } from "@mymoney/finance-core";

/**
 * Importe que se puede ocultar con el modo privado (CSS sobre `[data-privacy="hidden"]`). Los
 * porcentajes no usan este componente: siguen visibles.
 */
export function Amount({ value }: { readonly value: Money }) {
  return <span className="amount">{formatMoney(value)}</span>;
}

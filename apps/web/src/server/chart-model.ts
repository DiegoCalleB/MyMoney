import { money, type Money } from "@mymoney/finance-core";

/** Un trozo del gráfico: etiqueta, importe y su parte del total en puntos básicos (10000 = 100 %). */
export interface Slice {
  readonly key: string;
  readonly label: string;
  readonly value: Money;
  readonly shareBps: number;
}

export interface SliceInput {
  readonly key: string;
  readonly label: string;
  readonly value: Money;
}

/**
 * Reparte importes positivos de una misma moneda en trozos con su porcentaje. Los importes
 * se tratan como `bigint` (regla 13); solo el porcentaje resultante, que es una proporción y
 * no dinero, se expresa en puntos básicos enteros. Los valores cero o negativos no se
 * dibujan (un pasivo no es parte de una composición de lo que se tiene). Si hay más de
 * `max` trozos, el resto se agrupa en uno llamado `otherLabel`.
 */
export function buildSlices(
  items: readonly SliceInput[],
  options: { readonly max: number; readonly otherLabel: string },
): Slice[] {
  const positive = items.filter((i) => i.value.minor > 0n);
  const first = positive[0];
  if (!first) return [];
  const sorted = [...positive].sort((a, b) =>
    a.value.minor === b.value.minor
      ? a.label.localeCompare(b.label)
      : a.value.minor > b.value.minor
        ? -1
        : 1,
  );

  let shown: SliceInput[] = sorted;
  if (sorted.length > options.max) {
    const head = sorted.slice(0, options.max - 1);
    const rest = sorted.slice(options.max - 1);
    shown = [
      ...head,
      {
        key: "other",
        label: options.otherLabel,
        value: money(
          rest.reduce((sum, r) => sum + r.value.minor, 0n),
          first.value.currency,
        ),
      },
    ];
  }

  const total = shown.reduce((sum, s) => sum + s.value.minor, 0n);
  return shown.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    shareBps: Number((s.value.minor * 10000n) / total),
  }));
}

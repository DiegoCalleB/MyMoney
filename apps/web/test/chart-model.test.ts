import { money } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { buildSlices } from "@/server/chart-model";

const eur = (minor: bigint) => money(minor, "EUR");
const opts = { max: 3, otherLabel: "Otros" };

describe("buildSlices", () => {
  it("devuelve vacío sin importes positivos", () => {
    expect(buildSlices([], opts)).toEqual([]);
    expect(buildSlices([{ key: "a", label: "A", value: eur(-5n) }], opts)).toEqual([]);
    expect(buildSlices([{ key: "a", label: "A", value: eur(0n) }], opts)).toEqual([]);
  });

  it("ordena de mayor a menor y calcula porcentajes en puntos básicos", () => {
    const slices = buildSlices(
      [
        { key: "a", label: "A", value: eur(2500n) },
        { key: "b", label: "B", value: eur(7500n) },
      ],
      opts,
    );
    expect(slices.map((s) => [s.key, s.shareBps])).toEqual([
      ["b", 7500],
      ["a", 2500],
    ]);
  });

  it("ignora los pasivos y desempata por nombre", () => {
    const slices = buildSlices(
      [
        { key: "z", label: "Z", value: eur(100n) },
        { key: "a", label: "A", value: eur(100n) },
        { key: "d", label: "Deuda", value: eur(-900n) },
      ],
      opts,
    );
    expect(slices.map((s) => s.key)).toEqual(["a", "z"]);
  });

  it("agrupa el resto en «Otros» cuando hay más trozos que el máximo", () => {
    const slices = buildSlices(
      [1n, 2n, 3n, 4n, 5n].map((n) => ({
        key: `k${String(n)}`,
        label: `K${String(n)}`,
        value: eur(n * 100n),
      })),
      opts,
    );
    expect(slices.map((s) => s.key)).toEqual(["k5", "k4", "other"]);
    expect(slices[2]?.value.minor).toBe(600n);
    expect(slices[2]?.label).toBe("Otros");
    expect(slices.reduce((n, s) => n + s.shareBps, 0)).toBeLessThanOrEqual(10000);
  });

  it("no pierde precisión con importes muy grandes", () => {
    const big = 900_000_000_000_000n;
    const slices = buildSlices(
      [
        { key: "a", label: "A", value: eur(big) },
        { key: "b", label: "B", value: eur(big) },
      ],
      opts,
    );
    expect(slices.map((s) => s.shareBps)).toEqual([5000, 5000]);
  });
});

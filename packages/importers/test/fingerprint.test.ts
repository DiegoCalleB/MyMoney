import { calendarDate, money } from "@mymoney/finance-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fileSha256, fingerprintRows, toHex, type NormalizedRow } from "../src";

const row = (
  index: number,
  date: string,
  minor: bigint,
  description: string,
  balance: bigint | null = null,
): NormalizedRow => ({
  index,
  date: calendarDate(date),
  description,
  amount: money(minor, "EUR"),
  balanceAfter: balance === null ? null : money(balance, "EUR"),
});

const hexes = (rows: readonly NormalizedRow[], account = "acc-1") =>
  fingerprintRows(account, rows).map(toHex);

describe("fingerprintRows", () => {
  it("es estable, de 32 bytes, y depende de cada campo", () => {
    const base = row(1, "2026-10-27", -4530n, "Supermercado");
    const [h] = hexes([base]);
    expect(h).toHaveLength(64);
    expect(hexes([base])[0]).toBe(h);
    for (const other of [
      row(1, "2026-10-28", -4530n, "Supermercado"),
      row(1, "2026-10-27", -4531n, "Supermercado"),
      row(1, "2026-10-27", -4530n, "Otro"),
      row(1, "2026-10-27", -4530n, "Supermercado", 100n),
    ]) {
      expect(hexes([other])[0]).not.toBe(h);
    }
    expect(hexes([base], "acc-2")[0]).not.toBe(h);
  });

  it("ignora tildes, mayúsculas, espacios y la posición dentro del archivo", () => {
    const a = hexes([row(1, "2026-10-27", 500n, "Nómina  Empresa")]);
    const b = hexes([row(9, "2026-10-27", 500n, "nomina empresa")]);
    expect(a).toEqual(b);
  });

  it("dos apuntes idénticos en el mismo archivo tienen huellas distintas", () => {
    const [first, second] = hexes([
      row(1, "2026-10-27", -300n, "Café"),
      row(2, "2026-10-27", -300n, "Café"),
    ]);
    expect(first).not.toBe(second);
  });

  it("un archivo que se solapa da la misma huella a los apuntes que comparten", () => {
    const shared = row(1, "2026-10-26", -300n, "Café");
    const fileA = hexes([shared, row(2, "2026-10-27", -700n, "Cena")]);
    const fileB = hexes([
      row(1, "2026-10-27", -700n, "Cena"),
      { ...shared, index: 2 },
      row(3, "2026-10-28", 1200n, "Bizum"),
    ]);
    expect(fileB[1]).toBe(fileA[0]);
    expect(fileB[0]).toBe(fileA[1]);
  });

  it("con duplicados idénticos, un archivo parcial coincide con el principio del completo", () => {
    const full = hexes([row(1, "2026-10-27", -300n, "Café"), row(2, "2026-10-27", -300n, "Café")]);
    const partial = hexes([row(1, "2026-10-27", -300n, "Café")]);
    expect(full).toContain(partial[0]);
  });

  it("propiedad: reordenar las filas no cambia el conjunto de huellas", () => {
    const arbitraryRow = fc.record({
      day: fc.integer({ min: 1, max: 5 }),
      minor: fc.constantFrom(-500n, -300n, 700n),
      description: fc.constantFrom("Café", "Cena", "Bizum"),
    });
    fc.assert(
      fc.property(fc.array(arbitraryRow, { maxLength: 12 }), fc.nat(), (items, seed) => {
        const rows = items.map((it, i) =>
          row(i + 1, `2026-10-0${String(it.day)}`, it.minor, it.description),
        );
        const shuffled = [...rows].sort(
          (a, b) => ((a.index * 7 + seed) % 5) - ((b.index * 7 + seed) % 5),
        );
        expect(hexes(shuffled).sort()).toEqual(hexes(rows).sort());
        expect(new Set(hexes(rows)).size).toBe(rows.length);
      }),
      { numRuns: 200 },
    );
  });
});

describe("fileSha256 y toHex", () => {
  it("coincide con el vector de prueba conocido de SHA-256", () => {
    expect(toHex(fileSha256(new TextEncoder().encode("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

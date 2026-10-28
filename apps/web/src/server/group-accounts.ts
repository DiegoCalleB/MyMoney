import { money, type AccountLine, type Money } from "@mymoney/finance-core";

export interface AccountGroup {
  /** Identificador de la entidad, o `null` para las cuentas sin entidad. */
  readonly institutionId: string | null;
  readonly name: string;
  readonly total: Money;
  readonly lines: readonly AccountLine[];
}

/**
 * Agrupa las líneas de cuentas por entidad, con su subtotal en la moneda base. Las cuentas sin
 * entidad no se agrupan entre sí: cada una forma su propio grupo con su nombre, de modo que
 * una cuenta suelta se ve igual que antes. Las entidades con más dinero van primero.
 */
export function groupAccounts(
  lines: readonly AccountLine[],
  accounts: ReadonlyMap<string, { readonly name: string; readonly institutionId: string | null }>,
  institutions: ReadonlyMap<string, string>,
): AccountGroup[] {
  const groups = new Map<
    string,
    { institutionId: string | null; name: string; lines: AccountLine[] }
  >();
  for (const line of lines) {
    const meta = accounts.get(line.accountId);
    const institutionId = meta?.institutionId ?? null;
    const institutionName = institutionId ? institutions.get(institutionId) : undefined;
    // Una entidad desconocida (p. ej. sin permiso de lectura) se trata como cuenta suelta.
    const key = institutionName ? `i:${institutionId ?? ""}` : `a:${line.accountId}`;
    const group = groups.get(key);
    if (group) group.lines.push(line);
    else
      groups.set(key, {
        institutionId: institutionName ? institutionId : null,
        name: institutionName ?? meta?.name ?? "",
        lines: [line],
      });
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      total: money(
        g.lines.reduce((sum, l) => sum + l.contribution.minor, 0n),
        g.lines[0]?.contribution.currency ?? "EUR",
      ),
    }))
    .sort((a, b) =>
      a.total.minor === b.total.minor
        ? a.name.localeCompare(b.name)
        : a.total.minor > b.total.minor
          ? -1
          : 1,
    );
}

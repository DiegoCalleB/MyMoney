import "server-only";
import { add, calendarDate, zero, type CalendarDate } from "@mymoney/finance-core";
import type { AccountKind } from "@mymoney/schemas";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { incomeEventRow, type SpaceRow } from "@/server/home-model";
import { buildIncome, type IncomeModel } from "@/server/income-model";
import { loadHome } from "@/server/queries/home";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const INCOME_MONTHS = 12;

const EARNING_KINDS: ReadonlySet<AccountKind> = new Set([
  "current",
  "savings",
  "deposit",
  "cash",
  "brokerage",
  "fund_holding",
  "pension_plan",
  "crypto",
]);

/** Datos de la pantalla de cobros: dividendos e intereses del hogar y el valor de la cartera. */
export async function loadIncome(
  supabase: Supabase,
  spaceId: string,
): Promise<{ space: SpaceRow; today: CalendarDate; model: IncomeModel | null } | null> {
  const home = await loadHome(supabase, spaceId);
  if (!home) return null;
  const today = calendarDate(home.today);
  const events = await supabase.rpc("account_income_events", {
    p_space_id: spaceId,
    p_on: today,
  });
  if (events.error) {
    logger.warn("db.income_events_unavailable", { code: events.error.code });
    throw new Error("No se pudieron cargar los cobros");
  }
  // Cuentas que generan cobros: efectivo e inversión. Inmuebles, vehículos y deudas no cuentan.
  const earning = new Set(
    [...home.accounts.entries()]
      .filter(([, account]) => EARNING_KINDS.has(account.kind))
      .map(([id]) => id),
  );
  const base = home.space.base_currency;
  // Valor de esas cuentas (ya en moneda base): base de la rentabilidad por cobros.
  const portfolio = home.result.explanation.accounts
    .filter((line) => earning.has(line.accountId))
    .reduce((acc, line) => add(acc, line.contribution), zero(base));
  const model = buildIncome(
    z.array(incomeEventRow).parse(events.data),
    earning,
    base,
    portfolio,
    today,
    INCOME_MONTHS,
  );
  return { space: home.space, today, model };
}

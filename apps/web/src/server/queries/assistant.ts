import "server-only";
import { profileFacts } from "@mymoney/finance-core";
import {
  averageMonthlyExpense,
  classifyAccounts,
  type FactsSource,
} from "@/server/assistant-model";
import { loadHome } from "@/server/queries/home";
import { loadSpend } from "@/server/queries/spend";
import type { SpaceRow } from "@/server/home-model";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Cifras agregadas del hogar para el asistente y para la tarjeta «Tu punto de partida». */
export async function loadAssistantFacts(
  supabase: Supabase,
  spaceId: string,
): Promise<{ space: SpaceRow; source: FactsSource } | null> {
  const home = await loadHome(supabase, spaceId);
  if (!home) return null;
  const currency = home.space.base_currency;
  const { liquid, risk } = classifyAccounts(
    home.result.explanation.accounts,
    home.accounts,
    currency,
  );
  const total = home.result.value.total;

  // Gasto mensual: el que la persona indicó (supuesto) o, si no, la media de los últimos meses.
  let monthlyExpense = home.monthlyExpense;
  let expenseOrigin: FactsSource["expenseOrigin"] = monthlyExpense ? "assumption" : null;
  if (!monthlyExpense) {
    const spend = await loadSpend(supabase, spaceId, undefined, { uncategorized: "-", other: "-" });
    monthlyExpense = spend
      ? averageMonthlyExpense(spend.history, currency, spend.today.slice(0, 7))
      : null;
    expenseOrigin = monthlyExpense ? "measured" : null;
  }

  const { value: facts } = profileFacts({ total, liquid, risk, monthlyExpense });
  return {
    space: home.space,
    source: { currency, total, liquid, risk, monthlyExpense, expenseOrigin, facts },
  };
}

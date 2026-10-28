import "server-only";
import { calendarDate, type CalendarDate } from "@mymoney/finance-core";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { externalFlowRow, type SpaceRow } from "@/server/home-model";
import {
  buildMonth,
  parseMonth,
  shiftMonth,
  summarizeMonth,
  type CategoryTotalRow,
  type MonthlyRow,
  type SpendMonth,
  type SpendSummary,
} from "@/server/spend-model";
import { loadSpace } from "@/server/queries/home";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const bigintValue = z
  .union([z.string().regex(/^-?\d{1,18}$/), z.number().refine(Number.isSafeInteger)])
  .transform((v) => BigInt(v));
const currency = externalFlowRow.shape.currency;
const dateValue = externalFlowRow.shape.occurred_on;

const totalsRow = z.object({
  category_id: z.uuid().nullable(),
  flow: z.enum(["income", "expense"]),
  currency,
  amount_minor: bigintValue,
});
const monthlyRow = z.object({
  month: dateValue,
  currency,
  income_minor: bigintValue,
  expense_minor: bigintValue,
});
const categoryRow = z.object({ id: z.uuid(), name: z.string() });

export interface SpendData {
  readonly space: SpaceRow;
  readonly today: CalendarDate;
  readonly month: SpendMonth;
  readonly summary: SpendSummary;
  /** Últimos 12 meses con movimientos, del más reciente al más antiguo. */
  readonly history: readonly MonthlyRow[];
}

function check(label: string, error: { code: string } | null): void {
  if (error) {
    logger.error("db.query_failed", { code: `${label}:${error.code}` });
    throw new Error(`No se pudo cargar ${label}`);
  }
}

/** Gasto e ingreso de un mes por categoría, y el resumen mes a mes del último año. */
export async function loadSpend(
  supabase: Supabase,
  spaceId: string,
  requestedMonth: string | undefined,
  labels: { uncategorized: string; other: string },
): Promise<SpendData | null> {
  const space = await loadSpace(supabase, spaceId);
  if (!space) return null;
  const today = calendarDateInZone(new Date(), space.timezone);
  const month = parseMonth(requestedMonth) ?? buildMonth(today.slice(0, 7));
  const historyFrom = calendarDate(`${shiftMonth(month.key, -11)}-01`);

  const [totals, categories, monthly] = await Promise.all([
    supabase.rpc("category_totals", { p_space_id: spaceId, p_from: month.from, p_to: month.to }),
    supabase.from("categories").select("id,name").eq("space_id", spaceId).limit(1000),
    supabase.rpc("monthly_cashflow", { p_space_id: spaceId, p_from: historyFrom, p_to: month.to }),
  ]);
  check("gastos", totals.error);
  check("categorías", categories.error);
  check("resumen mensual", monthly.error);

  const names = new Map(
    z
      .array(categoryRow)
      .parse(categories.data)
      .map((c) => [c.id, c.name]),
  );
  const rows: CategoryTotalRow[] = z.array(totalsRow).parse(totals.data ?? []);
  const history: MonthlyRow[] = z
    .array(monthlyRow)
    .parse(monthly.data ?? [])
    .filter((r) => r.currency === space.base_currency)
    .sort((a, b) => (a.month < b.month ? 1 : -1));
  return {
    space,
    today,
    month,
    summary: summarizeMonth(rows, names, space.base_currency, labels),
    history,
  };
}

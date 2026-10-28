import "server-only";
import {
  calendarDate,
  addDays,
  detectAnomalies,
  money,
  type Anomaly,
  type CalendarDate,
  type Movement,
} from "@mymoney/finance-core";
import { z } from "zod";
import { calendarDateInZone } from "@/lib/dates";
import { logger } from "@/lib/logger";
import { externalFlowRow, type SpaceRow } from "@/server/home-model";
import { loadSpace } from "@/server/queries/home";
import type { createSupabaseServerClient } from "@/server/supabase";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const bigintValue = z
  .union([z.string().regex(/^-?\d{1,18}$/), z.number().refine(Number.isSafeInteger)])
  .transform((v) => BigInt(v));

const movementRow = z.object({
  id: z.uuid(),
  occurred_on: externalFlowRow.shape.occurred_on,
  kind: z.enum(["income", "expense"]),
  description: z.string().nullable(),
  transaction_legs: z.array(
    z.object({
      category_id: z.uuid().nullable(),
      amount_minor: bigintValue,
      currency: externalFlowRow.shape.currency,
    }),
  ),
});
const categoryRow = z.object({ id: z.uuid(), name: z.string() });

export interface ReviewData {
  readonly space: SpaceRow;
  readonly today: CalendarDate;
  readonly anomalies: readonly Anomaly[];
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly dataQuality: "high" | "low";
}

/** Gastos recientes que se salen de lo habitual, calculados con el último año de movimientos. */
export async function loadReview(supabase: Supabase, spaceId: string): Promise<ReviewData | null> {
  const space = await loadSpace(supabase, spaceId);
  if (!space) return null;
  const today = calendarDateInZone(new Date(), space.timezone);
  const from = addDays(today, -365);

  const [rows, categories] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id,occurred_on,kind,description,transaction_legs!inner(category_id,amount_minor,currency)",
      )
      .eq("space_id", spaceId)
      .eq("status", "settled")
      .in("kind", ["income", "expense"])
      .eq("transaction_legs.role", "external")
      .gte("occurred_on", from)
      .lte("occurred_on", today)
      .limit(5000),
    supabase.from("categories").select("id,name").eq("space_id", spaceId).limit(1000),
  ]);
  for (const [label, error] of [
    ["movimientos", rows.error],
    ["categorías", categories.error],
  ] as const) {
    if (error) {
      logger.error("db.query_failed", { code: `${label}:${error.code}` });
      throw new Error(`No se pudo cargar ${label}`);
    }
  }

  const movements: Movement[] = z
    .array(movementRow)
    .parse(rows.data ?? [])
    .flatMap((r) =>
      r.transaction_legs.map((leg) => ({
        id: r.id,
        date: calendarDate(r.occurred_on),
        kind: r.kind,
        description: r.description,
        categoryId: leg.category_id,
        amount: money(leg.amount_minor, leg.currency),
      })),
    );
  const { value, explanation } = detectAnomalies(movements, today, space.base_currency);
  return {
    space,
    today,
    anomalies: value,
    categoryNames: new Map(
      z
        .array(categoryRow)
        .parse(categories.data)
        .map((c) => [c.id, c.name]),
    ),
    dataQuality: explanation.dataQuality,
  };
}

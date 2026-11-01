import { calendarDate, type CalendarDate } from "@mymoney/finance-core";
import {
  accountRow,
  allocationRow,
  expenseAssumptionRow,
  externalFlowRow,
  institutionRow,
  pocketRow,
  spaceRow,
  valuationRow,
} from "@/server/home-model";
import { assembleHome, type HomeData } from "@/server/home-assemble";
import { historyDates } from "@/server/history-model";

/**
 * Datos de ejemplo para la demo pública. Todo es ficticio (regla 23): un hogar inventado con
 * cuentas, valoraciones y aportaciones generadas con fórmulas sencillas, anclado a la fecha de
 * hoy para que la demo siempre parezca actual. Pasa por el mismo cálculo que los datos reales.
 */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const eur = (units: number) => String(Math.round(units * 100));

const SPACE = id(1);
const BANK = id(10);
const BROKER = id(11);
const INSURER = id(12);

const ACCOUNTS = [
  { n: 20, name: "Cuenta nómina", kind: "current", institution: BANK, liability: false },
  { n: 21, name: "Cuenta de ahorro", kind: "savings", institution: BANK, liability: false },
  { n: 22, name: "Efectivo en casa", kind: "cash", institution: null, liability: false },
  { n: 23, name: "Cartera indexada", kind: "brokerage", institution: BROKER, liability: false },
  {
    n: 24,
    name: "Plan de pensiones",
    kind: "pension_plan",
    institution: INSURER,
    liability: false,
  },
  { n: 25, name: "Hipoteca", kind: "mortgage", institution: null, liability: true },
] as const;

/** Valor en euros de cada cuenta en el mes `i` (0 = el más antiguo de los 13). */
const VALUE: Record<number, (i: number) => number> = {
  20: (i) => 4200 + (i % 4) * 350,
  21: (i) => 38_000 + i * 450,
  22: () => 1500,
  23: (i) => 31_500 + i * 1000 + ((i * 7) % 5) * 300 - (i === 8 ? 1800 : 0),
  24: (i) => 15_000 + i * 270,
  25: (i) => 38_000 - i * 250,
};

export function buildDemoHome(today: CalendarDate): HomeData {
  const dates = historyDates(today, 12);
  const valuations = ACCOUNTS.flatMap((a) =>
    dates.map((as_of, i) =>
      valuationRow.parse({
        account_id: id(a.n),
        as_of,
        value_minor: eur(VALUE[a.n]?.(i) ?? 0),
        currency: "EUR",
      }),
    ),
  );
  // Aportaciones: una inicial hace un año y una mensual a cartera (500 €) y plan (200 €).
  const flows = [
    externalFlowRow.parse({
      account_id: id(23),
      occurred_on: dates[0],
      currency: "EUR",
      amount_minor: eur(30_000),
    }),
    externalFlowRow.parse({
      account_id: id(24),
      occurred_on: dates[0],
      currency: "EUR",
      amount_minor: eur(14_500),
    }),
    ...dates.slice(1).flatMap((occurred_on) => [
      externalFlowRow.parse({
        account_id: id(23),
        occurred_on,
        currency: "EUR",
        amount_minor: eur(500),
      }),
      externalFlowRow.parse({
        account_id: id(24),
        occurred_on,
        currency: "EUR",
        amount_minor: eur(200),
      }),
    ]),
  ];
  return assembleHome({
    space: spaceRow.parse({
      id: SPACE,
      name: "Hogar de ejemplo",
      base_currency: "EUR",
      timezone: "Europe/Madrid",
    }),
    today,
    accounts: ACCOUNTS.map((a) =>
      accountRow.parse({
        id: id(a.n),
        name: a.name,
        kind: a.kind,
        is_liability: a.liability,
        currency: "EUR",
        scope: "household",
        closed_on: null,
        institution_id: a.institution,
        share_bps: 10000,
      }),
    ),
    balances: [],
    valuations,
    movementsAfter: [],
    flows,
    fxRates: [],
    allocations: [20, 21, 22]
      .map((n) =>
        allocationRow.parse({
          pocket_id: id(30),
          account_id: id(n),
          asset_id: null,
          weight_bps: 10000,
        }),
      )
      .concat(
        [23, 24].map((n) =>
          allocationRow.parse({
            pocket_id: id(31),
            account_id: id(n),
            asset_id: null,
            weight_bps: 10000,
          }),
        ),
      ),
    pockets: [
      pocketRow.parse({ id: id(30), name: "Reserva", risk_level: "none" }),
      pocketRow.parse({ id: id(31), name: "Largo plazo", risk_level: "medium" }),
    ],
    institutions: [
      institutionRow.parse({ id: BANK, name: "Banco Ejemplo" }),
      institutionRow.parse({ id: BROKER, name: "Bróker Ejemplo" }),
      institutionRow.parse({ id: INSURER, name: "Aseguradora Ejemplo" }),
    ],
    notices: [],
    expense: [expenseAssumptionRow.parse({ value: eur(2100), currency: "EUR" })],
    planned: [],
    thresholds: [],
  });
}

/** Fecha de demostración fija para pruebas. */
export const DEMO_TODAY = calendarDate("2026-10-27");

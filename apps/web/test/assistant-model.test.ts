import { calendarDate, money, profileFacts, type AccountLine } from "@mymoney/finance-core";
import { describe, expect, it } from "vitest";
import { DEFAULT_ASSISTANT_MODEL, readAssistantEnv } from "@/lib/env";
import {
  ASSISTANT_SYSTEM_PROMPT,
  averageMonthlyExpense,
  classifyAccounts,
  createRateLimiter,
  factsBlock,
  guardReply,
} from "@/server/assistant-model";
import { extractText } from "@/server/anthropic";
import type { AccountMeta } from "@/server/home-model";

const eur = (minor: bigint) => money(minor, "EUR");
const line = (accountId: string, minor: bigint): AccountLine =>
  ({ accountId, contribution: eur(minor) }) as AccountLine;
const meta = (kind: AccountMeta["kind"]): AccountMeta => ({ name: "x", kind, institutionId: null });

describe("classifyAccounts", () => {
  const accounts = new Map<string, AccountMeta>([
    ["cash", meta("cash")],
    ["cur", meta("current")],
    ["sav", meta("savings")],
    ["bro", meta("brokerage")],
    ["fun", meta("fund_holding")],
    ["cry", meta("crypto")],
    ["pen", meta("pension_plan")],
    ["mor", meta("mortgage")],
  ]);

  it("reparte lo disponible y lo que sube y baja, y deja fuera pensiones y deudas", () => {
    const lines = [
      line("cash", 100n),
      line("cur", 200n),
      line("sav", 300n),
      line("bro", 1000n),
      line("fun", 2000n),
      line("cry", 4000n),
      line("pen", 9999n),
      line("mor", -5000n),
      line("desconocida", 7777n),
      line("cur", -50n), // un descubierto no resta de lo disponible
    ];
    const { liquid, risk } = classifyAccounts(lines, accounts, "EUR");
    expect(liquid.minor).toBe(600n);
    expect(risk.minor).toBe(7000n);
  });
});

describe("averageMonthlyExpense", () => {
  const row = (month: string, expense: bigint, currency: "EUR" | "USD" = "EUR") => ({
    month: calendarDate(month),
    currency,
    income_minor: 0n,
    expense_minor: expense,
  });

  it("promedia los últimos meses completos y deja fuera el mes en curso", () => {
    const rows = [
      row("2026-10-01", 999_999n), // en curso: no cuenta
      row("2026-09-01", 300n),
      row("2026-08-01", 200n),
      row("2026-07-01", 100n),
      row("2026-06-01", 9_999n), // más antiguo que los tres últimos
      row("2026-09-01", 5n, "USD"),
    ];
    expect(averageMonthlyExpense(rows, "EUR", "2026-10")?.minor).toBe(200n);
  });

  it("sin meses completos no hay media", () => {
    expect(averageMonthlyExpense([row("2026-10-01", 1n)], "EUR", "2026-10")).toBeNull();
  });
});

describe("factsBlock", () => {
  const base = {
    currency: "EUR" as const,
    total: eur(10_049_999n),
    liquid: eur(2_000_000n),
    risk: eur(5_000_000n),
  };

  it("lleva cifras redondeadas, la cobertura y las caídas, sin nombres", () => {
    const monthlyExpense = eur(200_000n);
    const facts = profileFacts({ ...base, monthlyExpense }).value;
    const text = factsBlock({ ...base, monthlyExpense, expenseOrigin: "assumption", facts });
    expect(text).toContain("100.500,00"); // 100 499,99 € redondeado al centenar
    expect(text).toContain("10,0 meses");
    expect(text).toContain("indicado por la persona");
    expect(text).toContain("caída del 30 %: 14,9 % del patrimonio");
    expect(factsBlock({ ...base, monthlyExpense, expenseOrigin: "measured", facts })).toContain(
      "media de los últimos meses completos",
    );
  });

  it("sin gasto conocido lo dice y redondea también los negativos", () => {
    const facts = profileFacts({ ...base, total: eur(0n), monthlyExpense: null }).value;
    const text = factsBlock({
      ...base,
      total: eur(-4_999n),
      monthlyExpense: null,
      expenseOrigin: null,
      facts,
    });
    expect(text).toContain("Gasto mensual: sin dato");
    expect(text).toContain("sin dato del patrimonio");
  });
});

describe("guardReply", () => {
  it("deja pasar una explicación educativa", () => {
    const ok = guardReply(
      "  Nadie puede saber de antemano cuál es el mejor momento. Mira tu plazo y tu colchón.  ",
    );
    expect(ok).toEqual({
      ok: true,
      text: "Nadie puede saber de antemano cuál es el mejor momento. Mira tu plazo y tu colchón.",
    });
    expect(guardReply("Es un concepto: no hay un buen momento garantizado.").ok).toBe(true);
  });

  it.each([
    "",
    "Te recomiendo aportar este mes.",
    "En tu lugar, yo esperaría un poco.",
    "Yo compraría ahora.",
    "Deberías vender antes del verano.",
    "Compra ya, que sube.",
    "Ahora es el mejor momento.",
    "Es un buen momento para entrar.",
    "No vendas ahora.",
    "Con Vanguard es más barato.",
    "Mira el fondo IE00B4L5Y983.",
  ])("bloquea %j", (reply) => {
    expect(guardReply(reply).ok).toBe(false);
  });

  it("las instrucciones del modelo prohíben recomendar operar y elegir el momento", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Nunca digas si conviene comprar/);
    expect(ASSISTANT_SYSTEM_PROMPT).toMatch(/Nunca nombres productos/);
  });
});

describe("createRateLimiter", () => {
  it("permite hasta el límite por ventana y por persona", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 10)).toBe(true);
    expect(limiter.allow("a", 20)).toBe(false);
    expect(limiter.allow("b", 20)).toBe(true);
    expect(limiter.allow("a", 1001)).toBe(true); // la primera ya salió de la ventana
  });
});

describe("readAssistantEnv", () => {
  const key = ["sk", "ant", "x".repeat(24)].join("-");
  it("exige una clave razonable y usa el modelo por defecto", () => {
    expect(readAssistantEnv({})).toBeNull();
    expect(readAssistantEnv({ ANTHROPIC_API_KEY: "corta" })).toBeNull();
    expect(readAssistantEnv({ ANTHROPIC_API_KEY: ` ${key} ` })).toEqual({
      apiKey: key,
      model: DEFAULT_ASSISTANT_MODEL,
    });
    expect(readAssistantEnv({ ANTHROPIC_API_KEY: key, ASSISTANT_MODEL: " otro " })?.model).toBe(
      "otro",
    );
  });
});

describe("extractText", () => {
  it("une los bloques de texto y descarta lo demás", () => {
    expect(
      extractText({
        content: [
          { type: "text", text: "Hola " },
          { type: "tool_use" },
          { type: "text", text: "mundo" },
        ],
      }),
    ).toEqual({ ok: true, text: "Hola mundo" });
  });
  it("detecta respuestas vacías o mal formadas", () => {
    expect(extractText({ content: [] })).toEqual({ ok: false, code: "empty" });
    expect(extractText({ content: "x" })).toEqual({ ok: false, code: "bad_shape" });
    expect(extractText(null)).toEqual({ ok: false, code: "bad_shape" });
  });
});

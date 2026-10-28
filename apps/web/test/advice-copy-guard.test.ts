import { describe, expect, it } from "vitest";
import { esES } from "@/messages/es-ES";

/**
 * Guardián de textos (reco-copy-guard, reglas 20-22): los textos de avisos y de rentabilidad
 * no nombran productos ni entidades, no dan órdenes de operar y no hablan de «asesoramiento»
 * ni de «test de idoneidad» salvo para negarlo.
 */
const KEYS = Object.keys(esES).filter(
  (k) =>
    k.startsWith("advice.") ||
    k.startsWith("returns.") ||
    k.startsWith("income.") ||
    k.startsWith("benchmark.") ||
    k.startsWith("tax."),
);

const ENTITIES =
  /trade republic|\bing\b|myinvestor|etoro|binance|vanguard|amundi|ishares|blackrock|santander|bbva|caixabank|openbank|indexa|finizens|revolut|degiro|interactive brokers/i;
const ORDERS =
  /\b(compra|comprar|vende|vender|traspasa|traspasar|mant[eé]n|mantener|invierte en|contrata)\b/i;
const ISIN = /\b[A-Z]{2}[A-Z0-9]{9}\d\b/;

describe("guardián de textos de avisos", () => {
  it("hay textos que vigilar", () => {
    expect(KEYS.length).toBeGreaterThan(10);
  });

  it.each(KEYS)("%s cumple los límites legales", (key) => {
    const text = esES[key as keyof typeof esES];
    expect(text).not.toMatch(ENTITIES);
    expect(text).not.toMatch(ORDERS);
    expect(text).not.toMatch(ISIN);
    expect(text).not.toMatch(/test de idoneidad/i);
    // «asesoramiento» solo para decir que esto no lo es.
    if (/asesoramiento/i.test(text)) expect(text).toMatch(/no son asesoramiento/i);
  });
});

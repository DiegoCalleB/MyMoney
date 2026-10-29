import { describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "../_shared/bytes.ts";
import {
  MAX_ACCESS_DAYS,
  authHeaders,
  buildAuthBody,
  parseAuthResponse,
  parseBalance,
  parseBanks,
  parseSession,
  parseTransactions,
  pemToPkcs8,
  sanitizeDescription,
  signApplicationJwt,
} from "../_shared/enable-banking.ts";

async function rsaPair() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${toBase64(der).match(/.{1,64}/g)?.join("\n") ?? ""}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}
const b64urlDecode = (s: string) => fromBase64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

describe("pemToPkcs8", () => {
  it("lee una clave PKCS8 y rechaza PKCS1, basura y vacío", async () => {
    const { pem } = await rsaPair();
    expect(pemToPkcs8(pem)?.length).toBeGreaterThan(100);
    expect(pemToPkcs8("-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----")).toBeNull();
    expect(pemToPkcs8("-----BEGIN PRIVATE KEY-----\n¡¡¡\n-----END PRIVATE KEY-----")).toBeNull();
    expect(pemToPkcs8("")).toBeNull();
  });
});

describe("signApplicationJwt", () => {
  it("firma RS256 con kid, emisor, audiencia y una hora de validez; se verifica con la pública", async () => {
    const { pem, publicKey } = await rsaPair();
    const jwt = await signApplicationJwt("app-123", pem, 1_700_000_000);
    const [h, p, sig] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: "JWT", alg: "RS256", kid: "app-123" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const ok = await crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      b64urlDecode(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
    expect(jwt).not.toContain("=");
    expect(authHeaders(jwt).authorization).toBe(`Bearer ${jwt}`);
  });

  it("rechaza una clave que no es PKCS8", async () => {
    await expect(signApplicationJwt("a", "no es una clave", 1)).rejects.toThrow("Clave de aplicación");
  });
});

describe("buildAuthBody", () => {
  const now = new Date("2026-10-29T10:00:00Z");
  const base = { bankName: "Banco Ficticio", country: "ES", state: "c.abc", redirectUrl: "https://app.example.test/conexiones/retorno" };

  it("pide permiso de lectura de una persona física y limita el plazo a 180 días", () => {
    const far = buildAuthBody({ ...base, validUntil: new Date("2030-01-01T00:00:00Z") }, now);
    expect(far).toEqual({
      access: { valid_until: new Date(now.getTime() + MAX_ACCESS_DAYS * 86_400_000).toISOString() },
      aspsp: { name: "Banco Ficticio", country: "ES" },
      state: "c.abc",
      redirect_url: base.redirectUrl,
      psu_type: "personal",
    });
    const short = buildAuthBody({ ...base, validUntil: new Date("2026-11-29T10:00:00Z") }, now);
    expect((short.access as { valid_until: string }).valid_until).toBe("2026-11-29T10:00:00.000Z");
  });
});

describe("analizadores", () => {
  it("parseAuthResponse solo acepta direcciones https", () => {
    expect(parseAuthResponse({ url: "https://banco.example.test/auth?x=1" })).toEqual({ url: "https://banco.example.test/auth?x=1" });
    for (const v of [{ url: "http://x" }, { url: "javascript:alert(1)" }, { url: 5 }, {}, null, [], { url: `https://${"a".repeat(3000)}` }]) {
      expect(parseAuthResponse(v)).toBeNull();
    }
  });

  it("parseBanks filtra entradas mal formadas", () => {
    expect(parseBanks({ aspsps: [{ name: "A", country: "ES" }, { name: "", country: "ES" }, { name: "B", country: "es" }, { name: 3, country: "ES" }, "x", { name: "x".repeat(101), country: "ES" }] })).toEqual([{ name: "A", country: "ES" }]);
    expect(parseBanks({})).toEqual([]);
    expect(parseBanks(null)).toEqual([]);
    expect(parseBanks({ aspsps: Array.from({ length: 600 }, () => ({ name: "A", country: "ES" })) })).toHaveLength(500);
  });

  it("parseSession guarda un identificador y solo una pista del IBAN", () => {
    const s = parseSession({
      session_id: "sess-1",
      access: { valid_until: "2027-04-01T00:00:00Z" },
      accounts: [
        { uid: "uid-1", account_id: { iban: "ES9121000418450200051332" }, currency: "EUR" },
        { uid: "uid-2", currency: "xx" },
        { uid: "mal uid" },
        { uid: 5 },
        "x",
        { uid: "uid-3", account_id: { iban: "AB" } },
      ],
    });
    expect(s).toEqual({
      sessionId: "sess-1",
      validUntil: "2027-04-01T00:00:00Z",
      accounts: [
        { uid: "uid-1", hint: "••••1332", currency: "EUR" },
        { uid: "uid-2", hint: "••••", currency: "" },
        { uid: "uid-3", hint: "••••", currency: "" },
      ],
    });
    expect(JSON.stringify(s)).not.toContain("ES9121000418450200051332");
    expect(parseSession({ session_id: "s", accounts: [], access: { valid_until: "no" } })?.validUntil).toBeNull();
    for (const v of [null, {}, { session_id: "s" }, { session_id: "mal id", accounts: [] }, { session_id: 5, accounts: [] }]) {
      expect(parseSession(v)).toBeNull();
    }
  });

  const balances = (...items: [string, string, string][]) => ({
    balances: items.map(([type, currency, amount]) => ({ balance_type: type, balance_amount: { currency, amount } })),
  });

  it("parseBalance elige por orden de preferencia y exige la moneda de la cuenta", () => {
    expect(parseBalance(balances(["ITAV", "EUR", "5.00"], ["CLBD", "EUR", "120.50"]), "EUR", 2)).toBe(12050n);
    expect(parseBalance(balances(["XPCD", "EUR", "7"], ["ITBD", "EUR", "9.99"]), "EUR", 2)).toBe(999n);
    expect(parseBalance(balances(["CLBD", "USD", "1.00"]), "EUR", 2)).toBeNull();
    expect(parseBalance(balances(["OTRO", "EUR", "1.00"]), "EUR", 2)).toBeNull();
  });

  it("parseBalance no guarda descubiertos ni importes ilegibles", () => {
    expect(parseBalance(balances(["CLBD", "EUR", "-3.00"]), "EUR", 2)).toBeNull();
    expect(parseBalance(balances(["CLBD", "EUR", "abc"]), "EUR", 2)).toBeNull();
    expect(parseBalance({ balances: [{ balance_type: "CLBD", balance_amount: { currency: "EUR", amount: 5 } }] }, "EUR", 2)).toBeNull();
    expect(parseBalance({}, "EUR", 2)).toBeNull();
  });

  it("sanitizeDescription quita IBAN y números largos y recorta", () => {
    expect(sanitizeDescription("Pago a ES9121000418450200051332 ref 123456789012  tienda")).toBe("Pago a ••• ref ••• tienda");
    expect(sanitizeDescription("x".repeat(100))).toHaveLength(60);
  });
});

describe("parseTransactions", () => {
  const tx = (over: Record<string, unknown> = {}) => ({
    entry_reference: "ref-1",
    transaction_amount: { currency: "EUR", amount: "12.34" },
    credit_debit_indicator: "DBIT",
    booking_date: "2026-10-01",
    status: "BOOK",
    remittance_information: ["Supermercado", "Ejemplo"],
    ...over,
  });

  it("convierte débitos en gastos y créditos en ingresos", () => {
    const r = parseTransactions(
      { transactions: [tx(), tx({ entry_reference: "ref-2", credit_debit_indicator: "CRDT", transaction_amount: { currency: "EUR", amount: "1500.00" }, booking_date: undefined, value_date: "2026-10-02" })], continuation_key: "k1" },
      "uid-1",
      "EUR",
      2,
    );
    expect(r.rejected).toBe(0);
    expect(r.continuationKey).toBe("k1");
    expect(r.flows).toEqual([
      { external_ref: "uid-1", id: "tx:ref-1", occurred_on: "2026-10-01", kind: "expense", amount_minor: "1234", currency: "EUR", description: "Supermercado Ejemplo" },
      { external_ref: "uid-1", id: "tx:ref-2", occurred_on: "2026-10-02", kind: "income", amount_minor: "150000", currency: "EUR", description: "Supermercado Ejemplo" },
    ]);
  });

  it("descarta y cuenta lo pendiente, sin referencia, de otra moneda o mal formado", () => {
    const r = parseTransactions(
      {
        transactions: [
          tx({ status: "PDNG" }),
          tx({ entry_reference: undefined }),
          tx({ entry_reference: "mal ref" }),
          tx({ booking_date: undefined, value_date: undefined }),
          tx({ booking_date: "01/10/2026" }),
          tx({ transaction_amount: { currency: "USD", amount: "1.00" } }),
          tx({ transaction_amount: { currency: "EUR", amount: "0.00" } }),
          tx({ transaction_amount: { currency: "EUR", amount: "x" } }),
          tx({ transaction_amount: { currency: "EUR", amount: 5 } }),
          tx({ credit_debit_indicator: "???" }),
          "texto",
          tx({ entry_reference: "ok", transaction_amount: { currency: "EUR", amount: "-2.00" }, remittance_information: "no es lista" }),
        ],
        continuation_key: "",
      },
      "uid-1",
      "EUR",
      2,
    );
    expect(r.flows.map((f) => [f.id, f.amount_minor, f.description])).toEqual([["tx:ok", "200", ""]]);
    expect(r.rejected).toBe(11);
    expect(r.continuationKey).toBeNull();
  });

  it("una respuesta sin lista cuenta como un rechazo", () => {
    expect(parseTransactions({ continuation_key: "k" }, "u", "EUR", 2)).toEqual({ flows: [], continuationKey: "k", rejected: 1 });
    expect(parseTransactions(null, "u", "EUR", 2).rejected).toBe(1);
  });
});

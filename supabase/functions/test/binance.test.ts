import { describe, expect, it } from "vitest";
import { fromBase64, toBase64 } from "../_shared/bytes.ts";
import {
  BINANCE_BASE,
  auditApiRestrictions,
  authHeaders,
  generateKeypair,
  parseBalances,
  parseFiatOrders,
  publicKeyFingerprint,
  sign,
  signedUrl,
  valueBalances,
} from "../_shared/binance.ts";

describe("claves Ed25519", () => {
  it("genera un par: la pública en PEM y la privada en PKCS8", async () => {
    const pair = await generateKeypair();
    expect(pair.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n[\s\S]+\n-----END PUBLIC KEY-----\n$/);
    expect(pair.publicKeyPem).not.toContain("PRIVATE");
    expect(pair.privateKeyPkcs8.length).toBeGreaterThan(32);
    expect(await publicKeyFingerprint(pair.publicKeyPem)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la firma se verifica con la clave pública y no con otra", async () => {
    const pair = await generateKeypair();
    const other = await generateKeypair();
    const signature = fromBase64(await sign(pair.privateKeyPkcs8, "a=1&b=2"));
    const spki = (pem: string) =>
      fromBase64(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, ""));
    const verify = async (pem: string, text: string) =>
      crypto.subtle.verify(
        { name: "Ed25519" },
        await crypto.subtle.importKey("spki", spki(pem), { name: "Ed25519" }, false, ["verify"]),
        signature,
        new TextEncoder().encode(text),
      );
    expect(await verify(pair.publicKeyPem, "a=1&b=2")).toBe(true);
    expect(await verify(pair.publicKeyPem, "a=1&b=3")).toBe(false);
    expect(await verify(other.publicKeyPem, "a=1&b=2")).toBe(false);
  });

  it("la URL firmada lleva timestamp, recvWindow y la firma de la consulta", async () => {
    const pair = await generateKeypair();
    const url = await signedUrl(BINANCE_BASE, "/api/v3/account", { omitZeroBalances: "true" }, pair.privateKeyPkcs8, 1_700_000_000_000);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://api.binance.com/api/v3/account");
    expect(parsed.searchParams.get("timestamp")).toBe("1700000000000");
    expect(parsed.searchParams.get("recvWindow")).toBe("10000");
    const signature = parsed.searchParams.get("signature") ?? "";
    expect(toBase64(fromBase64(signature))).toBe(signature);
    expect(url).not.toContain("PRIVATE");
  });

  it("las cabeceras solo llevan la clave pública de acceso", () => {
    expect(authHeaders("mi-clave")).toEqual({ "X-MBX-APIKEY": "mi-clave", accept: "application/json" });
  });
});

describe("auditApiRestrictions", () => {
  const readOnly = {
    ipRestrict: true,
    enableReading: true,
    enableWithdrawals: false,
    enableInternalTransfer: false,
    permitsUniversalTransfer: false,
    enableMargin: false,
    enableFutures: false,
    enableVanillaOptions: false,
    enableSpotAndMarginTrading: false,
  };

  it("acepta una clave solo de lectura y dice si tiene lista de IP", () => {
    expect(auditApiRestrictions(readOnly)).toEqual({ readOnly: true, ipRestricted: true, violations: [] });
    expect(auditApiRestrictions({ ...readOnly, ipRestrict: false }).ipRestricted).toBe(false);
  });

  it.each([
    "enableWithdrawals",
    "enableInternalTransfer",
    "permitsUniversalTransfer",
    "enableMargin",
    "enableFutures",
    "enableVanillaOptions",
    "enableSpotAndMarginTrading",
    "enablePortfolioMarginTrading",
    "enableFixApiTrade",
  ])("rechaza una clave con %s", (flag) => {
    const audit = auditApiRestrictions({ ...readOnly, [flag]: true });
    expect(audit.readOnly).toBe(false);
    expect(audit.violations).toEqual([flag]);
  });

  it("rechaza una clave que ni siquiera puede leer o una respuesta que no se entiende", () => {
    expect(auditApiRestrictions({ ...readOnly, enableReading: false })).toMatchObject({
      readOnly: false,
      violations: ["enableReading:false"],
    });
    expect(auditApiRestrictions(null).readOnly).toBe(false);
    expect(auditApiRestrictions("texto").readOnly).toBe(false);
    expect(auditApiRestrictions({}).readOnly).toBe(false);
  });
});

describe("parseBalances / valueBalances", () => {
  const response = {
    balances: [
      { asset: "BTC", free: "0.01000000", locked: "0.00500000" },
      { asset: "EUR", free: "100.50", locked: "0.00" },
      { asset: "ETH", free: "0.00000000", locked: "0.00000000" },
      { asset: "XYZ", free: "5", locked: "0" },
      { asset: "mala", free: "1", locked: "0" },
      { asset: "ABC", free: "-1", locked: "0" },
      { asset: "DEF", free: 3, locked: "0" },
      "texto",
    ],
  };

  it("suma libre y bloqueado, omite saldos a cero y cuenta lo que no entiende", () => {
    const { balances, rejected } = parseBalances(response);
    expect(balances).toEqual([
      { asset: "BTC", amount: "0.01500000" },
      { asset: "EUR", amount: "100.50" },
      { asset: "XYZ", amount: "5" },
    ]);
    expect(rejected).toBe(4);
    expect(parseBalances({ nada: 1 })).toEqual({ balances: [], rejected: 1 });
    expect(parseBalances(null)).toEqual({ balances: [], rejected: 1 });
  });

  it("escala distinta entre libre y bloqueado se alinea sin perder dígitos", () => {
    const { balances } = parseBalances({ balances: [{ asset: "BTC", free: "1", locked: "0.5" }] });
    expect(balances).toEqual([{ asset: "BTC", amount: "1.5" }]);
    const small = parseBalances({ balances: [{ asset: "BTC", free: "0.001", locked: "0" }] });
    expect(small.balances).toEqual([{ asset: "BTC", amount: "0.001" }]);
  });

  it("valora en la moneda de cotización y señala lo que no tiene precio", () => {
    const { balances } = parseBalances(response);
    const prices = new Map([["BTC", "60000.10"]]);
    const result = valueBalances(balances, prices, "EUR", 2);
    // 0,015 BTC × 60000,10 = 900,0015 → 900,00 €; + 100,50 € de efectivo.
    expect(result.valueMinor).toBe(90000n + 10050n);
    expect(result.unpriced).toEqual(["XYZ"]);
  });

  it("un precio cero o ilegible cuenta como sin precio", () => {
    const { balances } = parseBalances({ balances: [{ asset: "BTC", free: "1", locked: "0" }] });
    expect(valueBalances(balances, new Map([["BTC", "0"]]), "EUR", 2).unpriced).toEqual(["BTC"]);
    expect(valueBalances(balances, new Map([["BTC", "x"]]), "EUR", 2).unpriced).toEqual(["BTC"]);
    expect(valueBalances([{ asset: "BTC", amount: "uno" }], new Map([["BTC", "5"]]), "EUR", 2).unpriced).toEqual(["BTC"]);
  });
});

describe("parseFiatOrders", () => {
  const ms = Date.UTC(2026, 9, 1, 23, 59);
  const order = (over: Record<string, unknown> = {}) => ({
    orderNo: "ORD1",
    fiatCurrency: "EUR",
    indicatedAmount: "100.00",
    amount: "98.50",
    totalFee: "1.50",
    status: "Successful",
    createTime: ms,
    ...over,
  });

  it("un depósito completado es una aportación por lo acreditado", () => {
    const { flows, rejected } = parseFiatOrders({ data: [order()] }, "deposit", "EUR", "spot", 2);
    expect(rejected).toBe(0);
    expect(flows).toEqual([
      {
        external_ref: "spot",
        id: "deposit:ORD1",
        occurred_on: "2026-10-01",
        kind: "contribution",
        amount_minor: "9850",
        currency: "EUR",
        description: "Depósito en Binance",
      },
    ]);
  });

  it("una retirada completada es una retirada por lo solicitado", () => {
    const { flows } = parseFiatOrders({ data: [order()] }, "withdrawal", "EUR", "spot", 2);
    expect(flows[0]).toMatchObject({ id: "withdrawal:ORD1", kind: "withdrawal", amount_minor: "10000" });
  });

  it("descarta y cuenta lo que no está completado, es de otra moneda o está mal formado", () => {
    const { flows, rejected } = parseFiatOrders(
      {
        data: [
          order({ status: "Processing" }),
          order({ fiatCurrency: "USD" }),
          order({ orderNo: "" }),
          order({ orderNo: 5 }),
          order({ amount: "0" }),
          order({ amount: "x" }),
          order({ amount: 5 }),
          order({ createTime: "ayer" }),
          order({ createTime: 0 }),
          order({ createTime: 1.5 }),
          "texto",
          order({ orderNo: "OK" }),
        ],
      },
      "deposit",
      "EUR",
      "spot",
      2,
    );
    expect(flows.map((f) => f.id)).toEqual(["deposit:OK"]);
    expect(rejected).toBe(11);
  });

  it("una respuesta sin lista cuenta como un rechazo", () => {
    expect(parseFiatOrders({ code: "-1" }, "deposit", "EUR", "spot", 2)).toEqual({ flows: [], rejected: 1 });
    expect(parseFiatOrders(null, "deposit", "EUR", "spot", 2)).toEqual({ flows: [], rejected: 1 });
  });
});

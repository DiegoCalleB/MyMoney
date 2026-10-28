// Adaptador de Binance (API de solo lectura) [A VERIFICAR contra la API real: los nombres de
// campo salen de la documentación pública y se validan aquí de forma estricta]. Sin dependencias.
//
//  · Autenticación con un par de claves Ed25519 que genera el servidor: la persona solo registra
//    la clave PÚBLICA en Binance y la privada nunca sale de la bóveda.
//  · Se rechaza cualquier clave que pueda operar, retirar o transferir.
//  · Todo importe se trata como texto y se convierte con enteros: ningún `number` (regla 13).
import { toBase64, utf8, type Bytes } from "./bytes.ts";
import { isZero, multiply, parseFixed, toMinorUnits } from "./decimal.ts";

export const BINANCE_BASE = "https://api.binance.com";
const RECV_WINDOW_MS = 10_000;

export interface Keypair {
  /** Clave pública en PEM (SPKI): es lo que se pega en Binance. */
  readonly publicKeyPem: string;
  /** Clave privada en PKCS8, para cifrarla en la bóveda. */
  readonly privateKeyPkcs8: Bytes;
}

function pem(label: string, der: Uint8Array): string {
  const base64 = toBase64(der);
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) lines.push(base64.slice(i, i + 64));
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export async function generateKeypair(): Promise<Keypair> {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return { publicKeyPem: pem("PUBLIC KEY", spki), privateKeyPkcs8: pkcs8 };
}

/** Huella SHA-256 (hex) de la clave pública: se puede mostrar para reconocer la clave. */
export async function publicKeyFingerprint(publicKeyPem: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(publicKeyPem)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Firma Ed25519 de la cadena de consulta, en base64 (como pide Binance). */
export async function sign(privateKeyPkcs8: Bytes, query: string): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", privateKeyPkcs8, { name: "Ed25519" }, false, [
    "sign",
  ]);
  return toBase64(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key, utf8(query))));
}

/** URL firmada de un endpoint SIGNED (`timestamp`, `recvWindow` y `signature`). */
export async function signedUrl(
  base: string,
  path: string,
  params: Readonly<Record<string, string>>,
  privateKeyPkcs8: Bytes,
  nowMs: number,
): Promise<string> {
  const query = new URLSearchParams({
    ...params,
    recvWindow: String(RECV_WINDOW_MS),
    timestamp: String(nowMs),
  }).toString();
  const signature = await sign(privateKeyPkcs8, query);
  return `${base}${path}?${query}&signature=${encodeURIComponent(signature)}`;
}

export function authHeaders(apiKey: string): Record<string, string> {
  return { "X-MBX-APIKEY": apiKey, accept: "application/json" };
}

// ---------------------------------------------------------------------------
// Permisos de la clave
// ---------------------------------------------------------------------------

export interface KeyAudit {
  readonly readOnly: boolean;
  readonly ipRestricted: boolean;
  /** Permisos peligrosos que tiene la clave (nombres de la API de Binance). */
  readonly violations: readonly string[];
}

const FORBIDDEN_FLAGS = [
  "enableWithdrawals",
  "enableInternalTransfer",
  "permitsUniversalTransfer",
  "enableMargin",
  "enableFutures",
  "enableVanillaOptions",
  "enableSpotAndMarginTrading",
  "enablePortfolioMarginTrading",
  "enableFixApiTrade",
] as const;

/** Respuesta de `GET /sapi/v1/account/apiRestrictions`. Solo es válida una clave de solo lectura. */
export function auditApiRestrictions(json: unknown): KeyAudit {
  const data = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;
  const violations = FORBIDDEN_FLAGS.filter((flag) => data[flag] === true);
  const canRead = data.enableReading === true;
  return {
    readOnly: canRead && violations.length === 0,
    ipRestricted: data.ipRestrict === true,
    violations: canRead ? violations : [...violations, "enableReading:false"],
  };
}

// ---------------------------------------------------------------------------
// Saldos y valoración
// ---------------------------------------------------------------------------

export interface Balance {
  readonly asset: string;
  /** Cantidad total (libre + bloqueada) como texto decimal. */
  readonly amount: string;
}

const ASSET = /^[A-Z0-9]{1,20}$/;

/** Respuesta de `GET /api/v3/account`: saldos con cantidad positiva; lo que no se entiende se cuenta. */
export function parseBalances(json: unknown): { balances: Balance[]; rejected: number } {
  const list = (json as { balances?: unknown } | null)?.balances;
  if (!Array.isArray(list)) return { balances: [], rejected: 1 };
  const balances: Balance[] = [];
  let rejected = 0;
  for (const item of list as unknown[]) {
    const entry = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const free = typeof entry.free === "string" ? parseFixed(entry.free) : null;
    const locked = typeof entry.locked === "string" ? parseFixed(entry.locked) : null;
    if (typeof entry.asset !== "string" || !ASSET.test(entry.asset) || !free || !locked) {
      rejected += 1;
      continue;
    }
    const scale = Math.max(free.scale, locked.scale);
    const scaled = (v: { int: bigint; scale: number }) => v.int * 10n ** BigInt(scale - v.scale);
    const total = scaled(free) + scaled(locked);
    if (total === 0n) continue;
    const digits = total.toString().padStart(scale + 1, "0");
    const amount = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
    balances.push({ asset: entry.asset, amount });
  }
  return { balances, rejected };
}

export interface Valuation {
  /** Valor total en unidades mínimas de la moneda de cotización. */
  readonly valueMinor: bigint;
  /** Activos con saldo que no se han podido valorar (sin precio en esa moneda). */
  readonly unpriced: readonly string[];
}

/**
 * Valora los saldos en la moneda de cotización: el saldo en esa moneda cuenta tal cual y el resto
 * se multiplica por su precio. Lo que no tiene precio no se suma y se informa (`unpriced`).
 */
export function valueBalances(
  balances: readonly Balance[],
  prices: ReadonlyMap<string, string>,
  quote: string,
  minorDigits: number,
): Valuation {
  let total = 0n;
  const unpriced: string[] = [];
  for (const balance of balances) {
    const amount = parseFixed(balance.amount);
    const price = balance.asset === quote ? parseFixed("1") : parseFixed(prices.get(balance.asset) ?? "");
    if (!amount || !price || isZero(price)) {
      unpriced.push(balance.asset);
      continue;
    }
    total += toMinorUnits(multiply(amount, price), minorDigits);
  }
  return { valueMinor: total, unpriced };
}

// ---------------------------------------------------------------------------
// Depósitos y retiradas de dinero fiat
// ---------------------------------------------------------------------------

export interface FlowItem {
  readonly external_ref: string;
  readonly id: string;
  readonly occurred_on: string;
  readonly kind: "contribution" | "withdrawal";
  readonly amount_minor: string;
  readonly currency: string;
  readonly description: string;
}

/**
 * Respuesta de `GET /sapi/v1/fiat/orders` (transactionType 0 = depósito, 1 = retirada). Solo cuentan
 * las operaciones completadas en la moneda de la cuenta; el resto se cuenta como rechazada.
 */
export function parseFiatOrders(
  json: unknown,
  direction: "deposit" | "withdrawal",
  currency: string,
  externalRef: string,
  minorDigits: number,
): { flows: FlowItem[]; rejected: number } {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return { flows: [], rejected: 1 };
  const flows: FlowItem[] = [];
  let rejected = 0;
  for (const item of data as unknown[]) {
    const entry = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    // Depósito: lo que se acreditó. Retirada: lo solicitado (incluye comisión): sale de la cuenta.
    const raw = direction === "deposit" ? entry.amount : entry.indicatedAmount;
    const amount = typeof raw === "string" ? parseFixed(raw) : null;
    const created = entry.createTime;
    const orderNo = entry.orderNo;
    if (
      entry.status !== "Successful" ||
      entry.fiatCurrency !== currency ||
      typeof orderNo !== "string" ||
      orderNo.length < 1 ||
      orderNo.length > 100 ||
      !amount ||
      isZero(amount) ||
      typeof created !== "number" ||
      !Number.isSafeInteger(created) ||
      created <= 0
    ) {
      rejected += 1;
      continue;
    }
    flows.push({
      external_ref: externalRef,
      id: `${direction}:${orderNo}`,
      occurred_on: new Date(created).toISOString().slice(0, 10),
      kind: direction === "deposit" ? "contribution" : "withdrawal",
      amount_minor: toMinorUnits(amount, minorDigits).toString(),
      currency,
      description: direction === "deposit" ? "Depósito en Binance" : "Retirada de Binance",
    });
  }
  return { flows, rejected };
}

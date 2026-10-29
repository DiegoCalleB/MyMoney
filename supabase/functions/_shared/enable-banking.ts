// Adaptador de Enable Banking (agregador PSD2, solo lectura) [A VERIFICAR contra la API real y su
// sandbox: los nombres de campo salen de su documentación pública y se validan de forma estricta].
//  · La aplicación se autentica con un JWT RS256 firmado con su clave privada (secreto de la función).
//  · Nunca se guarda un IBAN: de cada cuenta solo se conserva un identificador opaco (uid) y los
//    4 últimos caracteres como pista.
//  · Los importes son texto decimal; se convierten con enteros (regla 13).
import { fromBase64, utf8, toBase64, type Bytes } from "./bytes.ts";
import { isZero, parseFixed, toMinorUnits } from "./decimal.ts";

export const ENABLE_BANKING_BASE = "https://api.enablebanking.com";
/** Máximo de validez del permiso que se pide (PSD2: 180 días). */
export const MAX_ACCESS_DAYS = 180;

function base64url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Clave privada PKCS8 (PEM «PRIVATE KEY») → bytes. Las PKCS1 («RSA PRIVATE KEY») no se admiten. */
export function pemToPkcs8(pem: string): Bytes | null {
  const match = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(pem);
  const body = match?.[1]?.replace(/\s+/g, "");
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
  return fromBase64(body);
}

/** JWT de la aplicación (RS256, una hora de validez como máximo). */
export async function signApplicationJwt(
  applicationId: string,
  privateKeyPem: string,
  nowSeconds: number,
): Promise<string> {
  const der = pemToPkcs8(privateKeyPem);
  if (!der) throw new Error("Clave de aplicación no válida");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const header = base64url(utf8(JSON.stringify({ typ: "JWT", alg: "RS256", kid: applicationId })));
  const payload = base64url(
    utf8(
      JSON.stringify({
        iss: "enablebanking.com",
        aud: "api.enablebanking.com",
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, key, utf8(`${header}.${payload}`)),
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

export function authHeaders(jwt: string): Record<string, string> {
  return { authorization: `Bearer ${jwt}`, accept: "application/json" };
}

export interface AuthRequest {
  readonly bankName: string;
  readonly country: string;
  readonly state: string;
  readonly redirectUrl: string;
  readonly validUntil: Date;
}

/** Cuerpo de `POST /auth`: permiso de lectura de cuentas de una persona física. */
export function buildAuthBody(request: AuthRequest, now: Date): Record<string, unknown> {
  const limit = now.getTime() + MAX_ACCESS_DAYS * 86_400_000;
  const until = new Date(Math.min(request.validUntil.getTime(), limit));
  return {
    access: { valid_until: until.toISOString() },
    aspsp: { name: request.bankName, country: request.country },
    state: request.state,
    redirect_url: request.redirectUrl,
    psu_type: "personal",
  };
}

const record = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Respuesta de `POST /auth`: dirección del banco (solo https) a la que enviar a la persona. */
export function parseAuthResponse(json: unknown): { url: string } | null {
  const { url } = record(json);
  return typeof url === "string" && url.startsWith("https://") && url.length <= 2048 ? { url } : null;
}

export interface Bank {
  readonly name: string;
  readonly country: string;
}

/** Respuesta de `GET /aspsps`: nombres de bancos (límite de 500). */
export function parseBanks(json: unknown): Bank[] {
  const list = record(json).aspsps;
  if (!Array.isArray(list)) return [];
  const banks: Bank[] = [];
  for (const item of (list as unknown[]).slice(0, 500)) {
    const { name, country } = record(item);
    if (typeof name === "string" && name.length > 0 && name.length <= 100 && typeof country === "string" && /^[A-Z]{2}$/.test(country)) {
      banks.push({ name, country });
    }
  }
  return banks;
}

export interface ProviderAccount {
  /** Identificador opaco de la cuenta en el proveedor. */
  readonly uid: string;
  /** Pista para reconocerla: «••••1234». Nunca el IBAN completo. */
  readonly hint: string;
  readonly currency: string;
}

export interface Session {
  readonly sessionId: string;
  readonly validUntil: string | null;
  readonly accounts: readonly ProviderAccount[];
}

const UID = /^[A-Za-z0-9._:-]{1,100}$/;

/** Respuesta de `POST /sessions`. */
export function parseSession(json: unknown): Session | null {
  const data = record(json);
  const sessionId = data.session_id;
  if (typeof sessionId !== "string" || !UID.test(sessionId) || !Array.isArray(data.accounts)) return null;
  const accounts: ProviderAccount[] = [];
  for (const item of (data.accounts as unknown[]).slice(0, 50)) {
    const account = record(item);
    const iban = record(account.account_id).iban;
    const currency = account.currency;
    if (typeof account.uid !== "string" || !UID.test(account.uid)) continue;
    accounts.push({
      uid: account.uid,
      hint: typeof iban === "string" && iban.length >= 4 ? `••••${iban.slice(-4)}` : "••••",
      currency: typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "",
    });
  }
  const validUntil = record(data.access).valid_until;
  return {
    sessionId,
    validUntil: typeof validUntil === "string" && !Number.isNaN(Date.parse(validUntil)) ? validUntil : null,
    accounts,
  };
}

/** Orden de preferencia del tipo de saldo: contable de cierre, intermedio, previsto, disponible. */
const BALANCE_ORDER = ["CLBD", "ITBD", "XPCD", "CLAV", "ITAV"] as const;

/**
 * Saldo de `GET /accounts/{uid}/balances` en unidades mínimas. `null` si no hay un saldo en la
 * moneda de la cuenta o es negativo (un descubierto no se guarda como valoración: la valoración
 * no admite negativos y el saldo seguiría saliendo de los movimientos).
 */
export function parseBalance(json: unknown, currency: string, minorDigits: number): bigint | null {
  const list = record(json).balances;
  if (!Array.isArray(list)) return null;
  for (const type of BALANCE_ORDER) {
    for (const item of list as unknown[]) {
      const entry = record(item);
      const amount = record(entry.balance_amount);
      if (entry.balance_type !== type || amount.currency !== currency || typeof amount.amount !== "string") continue;
      if (amount.amount.startsWith("-")) return null;
      const fixed = parseFixed(amount.amount);
      return fixed ? toMinorUnits(fixed, minorDigits) : null;
    }
  }
  return null;
}

export interface BankFlow {
  readonly external_ref: string;
  readonly id: string;
  readonly occurred_on: string;
  readonly kind: "income" | "expense";
  readonly amount_minor: string;
  readonly currency: string;
  readonly description: string;
}

/** Quita de un concepto lo que parece un IBAN o un número largo, y lo recorta a 60 caracteres. */
export function sanitizeDescription(text: string): string {
  return text
    .replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, "•••")
    .replace(/\d{8,}/g, "•••")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Respuesta de `GET /accounts/{uid}/transactions`: solo movimientos contabilizados («BOOK») en la
 * moneda de la cuenta, con referencia estable. Un crédito es un ingreso y un débito un gasto.
 */
export function parseTransactions(
  json: unknown,
  externalRef: string,
  currency: string,
  minorDigits: number,
): { flows: BankFlow[]; continuationKey: string | null; rejected: number } {
  const data = record(json);
  const list = data.transactions;
  const key = data.continuation_key;
  const continuationKey = typeof key === "string" && key.length > 0 && key.length <= 500 ? key : null;
  if (!Array.isArray(list)) return { flows: [], continuationKey, rejected: 1 };
  const flows: BankFlow[] = [];
  let rejected = 0;
  for (const item of list as unknown[]) {
    const tx = record(item);
    const amount = record(tx.transaction_amount);
    const reference = tx.entry_reference;
    const day = typeof tx.booking_date === "string" ? tx.booking_date : tx.value_date;
    const fixed = typeof amount.amount === "string" ? parseFixed(amount.amount.replace(/^-/, "")) : null;
    const indicator = tx.credit_debit_indicator;
    if (
      tx.status !== "BOOK" ||
      typeof reference !== "string" ||
      !UID.test(reference) ||
      typeof day !== "string" ||
      !DATE.test(day) ||
      amount.currency !== currency ||
      !fixed ||
      isZero(fixed) ||
      (indicator !== "CRDT" && indicator !== "DBIT")
    ) {
      rejected += 1;
      continue;
    }
    const remittance = Array.isArray(tx.remittance_information)
      ? (tx.remittance_information as unknown[]).filter((v): v is string => typeof v === "string").join(" ")
      : "";
    flows.push({
      external_ref: externalRef,
      id: `tx:${reference}`,
      occurred_on: day,
      kind: indicator === "CRDT" ? "income" : "expense",
      amount_minor: toMinorUnits(fixed, minorDigits).toString(),
      currency,
      description: sanitizeDescription(remittance),
    });
  }
  return { flows, continuationKey, rejected };
}

import {
  MAX_SYMBOLS_PER_REQUEST,
  buildTickerUrl,
  chunk,
  parseTickerPrices,
  tickerSymbols,
  utcDate,
  type PriceRow,
} from "./prices.ts";

export interface UpdatePricesConfig {
  readonly supabaseUrl: string;
  /** Clave secreta de Supabase: solo existe dentro de esta función (regla 3). */
  readonly serviceKey: string;
  /** Secreto compartido con la tarea programada que llama a la función. */
  readonly cronSecret: string;
  readonly quote: string;
  readonly binanceBase: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Compara dos secretos sin revelar por el tiempo dónde difieren: se comparan sus SHA-256. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = [await sha256(a), await sha256(b)];
  return x.reduce((diff, byte, i) => diff | (byte ^ (y[i] as number)), 0) === 0;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function rpc(config: UpdatePricesConfig, fetchFn: Fetch, name: string, body: unknown): Promise<Response> {
  return fetchFn(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: config.serviceKey,
      authorization: `Bearer ${config.serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Actualiza los precios de los criptoactivos que hay en la base de datos. Una sola petición
 * pública de solo lectura a Binance por cada 100 símbolos (los límites son por IP): sin reintentos
 * automáticos, si falla se informa y la siguiente ejecución programada lo vuelve a intentar.
 * La respuesta solo lleva contadores.
 */
export async function handleUpdatePrices(
  request: Request,
  config: UpdatePricesConfig,
  fetchFn: Fetch,
  now: Date,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = request.headers.get("x-cron-secret") ?? "";
  if (config.cronSecret === "" || !(await safeEqual(secret, config.cronSecret))) {
    return json(401, { error: "unauthorized" });
  }

  const listed = await rpc(config, fetchFn, "crypto_tickers", {});
  if (!listed.ok) return json(502, { error: "tickers_failed" });
  const tickers = ((await listed.json()) as { ticker?: unknown }[])
    .map((row) => row.ticker)
    .filter((ticker): ticker is string => typeof ticker === "string");
  const symbols = tickerSymbols(tickers, config.quote);
  if (symbols.length === 0) return json(200, { updated: 0, rejected: 0, symbols: 0 });

  const asOf = utcDate(now);
  const rows: PriceRow[] = [];
  let rejected = 0;
  for (const part of chunk(symbols, MAX_SYMBOLS_PER_REQUEST)) {
    const response = await fetchFn(buildTickerUrl(config.binanceBase, part), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return json(502, { error: "provider_failed", status: response.status });
    const parsed = parseTickerPrices(await response.json(), config.quote, asOf);
    rows.push(...parsed.rows);
    rejected += parsed.rejected;
  }

  if (rows.length === 0) return json(200, { updated: 0, rejected, symbols: symbols.length });
  const saved = await rpc(config, fetchFn, "upsert_ref_prices", { p_rows: rows });
  if (!saved.ok) return json(502, { error: "save_failed" });
  return json(200, { updated: rows.length, rejected, symbols: symbols.length });
}

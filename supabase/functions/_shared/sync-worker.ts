// Trabajador de sincronización: reclama trabajos de la cola, descifra las credenciales, lee del
// proveedor (solo lectura) y entrega el resultado a ingest_sync. Registra solo contadores.
import { fromBase64, type Bytes } from "./bytes.ts";
import {
  auditApiRestrictions,
  authHeaders,
  parseBalances,
  parseFiatOrders,
  signedUrl,
  valueBalances,
  type FlowItem,
} from "./binance.ts";
import { buildTickerUrl, chunk, MAX_SYMBOLS_PER_REQUEST, parseTickerPrices, utcDate } from "./prices.ts";
import { json, serviceRpc, type Fetch, type RpcConfig } from "./rpc.ts";
import { readBundle } from "./secret-bundle.ts";
import { VaultError, type Kek } from "./vault.ts";
import { safeEqual } from "./update-prices.ts";

export interface SyncConfig extends RpcConfig {
  readonly cronSecret: string;
  readonly binanceBase: string;
  /** Moneda de las cuentas (la valoración y los movimientos se hacen en ella). */
  readonly quote: string;
  readonly minorDigits: number;
  readonly maxJobs: number;
}

export interface SyncDeps {
  readonly fetchFn: Fetch;
  readonly now: () => Date;
  readonly keks: { readonly current: Kek; readonly byVersion: ReadonlyMap<number, Kek> };
}

interface Job {
  readonly job_id: number;
  readonly connection_id: string;
  readonly provider: string;
}

/** Fallo de un trabajo con el destino que debe tener en la cola. */
export class JobFailure extends Error {
  constructor(
    readonly outcome: "retry" | "failed",
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

const GLOBAL_BUCKET = "binance:global";
// Los límites de Binance son por IP: el cubo global usa la mitad del peso por minuto publicado
// [A VERIFICAR la cifra vigente] y una sincronización pide ~30 de peso.
const BUCKET_CAPACITY = 3000;
const BUCKET_REFILL_PER_SEC = 50;
const SYNC_WEIGHT = 30;
const FIAT_WINDOW_DAYS = 89;
const DEFAULT_RETRY_SECONDS = 300;
const MAX_RETRY_SECONDS = 3600;
const EXTERNAL_REF = "spot";

function classifyHttp(status: number, retryAfter: string | null): JobFailure {
  if (status === 401 || status === 403) return new JobFailure("failed", "auth_rejected");
  if (status === 418 || status === 429) {
    const seconds = Number(retryAfter);
    const wait = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, MAX_RETRY_SECONDS) : DEFAULT_RETRY_SECONDS;
    return new JobFailure("retry", "rate_limited", Math.ceil(wait));
  }
  if (status >= 500) return new JobFailure("retry", "provider_unavailable");
  return new JobFailure("failed", "bad_request");
}

async function providerGet(
  fetchFn: Fetch,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new JobFailure("retry", "network");
  }
  if (!response.ok) throw classifyHttp(response.status, response.headers.get("retry-after"));
  try {
    return await response.json();
  } catch {
    throw new JobFailure("retry", "provider_unavailable");
  }
}

interface KeyBundle {
  readonly apiKey: string;
  readonly privateKey: Bytes;
}

function keyBundle(bundle: Record<string, unknown>): KeyBundle {
  const { apiKey, privateKey } = bundle;
  if (typeof apiKey !== "string" || typeof privateKey !== "string") {
    throw new JobFailure("failed", "secret_incomplete");
  }
  return { apiKey, privateKey: fromBase64(privateKey) };
}

/** Sincroniza una conexión de Binance. Devuelve contadores; lanza JobFailure si hay que reintentar o fallar. */
async function syncBinance(
  job: Job,
  config: SyncConfig,
  deps: SyncDeps,
): Promise<{ flows: number; unpriced: number }> {
  const { fetchFn } = deps;
  const wait = await serviceRpc<number>(config, fetchFn, "take_rate_tokens", {
    p_bucket: GLOBAL_BUCKET,
    p_n: SYNC_WEIGHT,
    p_capacity: BUCKET_CAPACITY,
    p_refill_per_sec: BUCKET_REFILL_PER_SEC,
  });
  if (!wait.ok || typeof wait.data !== "number") throw new JobFailure("retry", "internal");
  if (wait.data > 0) throw new JobFailure("retry", "rate_limited", wait.data);

  let stored: Awaited<ReturnType<typeof readBundle>>;
  try {
    stored = await readBundle(config, fetchFn, job.connection_id, deps.keks.byVersion);
  } catch (error) {
    // Un fallo de la bóveda es definitivo; uno de red (error cualquiera) se reintenta.
    throw error instanceof VaultError ? new JobFailure("failed", "secret_unreadable") : error;
  }
  if (!stored) throw new JobFailure("failed", "no_secret");
  const { apiKey, privateKey } = keyBundle(stored.bundle);

  try {
    const nowMs = deps.now().getTime();
    const headers = authHeaders(apiKey);
    const get = async (path: string, params: Record<string, string>) =>
      providerGet(fetchFn, await signedUrl(config.binanceBase, path, params, privateKey, nowMs), headers);

    // 1. La clave debe seguir siendo de solo lectura: si alguien le añadió permisos, se revoca.
    const audit = auditApiRestrictions(await get("/sapi/v1/account/apiRestrictions", {}));
    if (!audit.readOnly) throw new JobFailure("failed", "key_not_readonly");

    // 2. Saldos y su valor en la moneda de la cuenta.
    const { balances } = parseBalances(await get("/api/v3/account", {}));
    const symbols = balances
      .filter((b) => b.asset !== config.quote)
      .map((b) => `${b.asset}${config.quote}`);
    const prices = new Map<string, string>();
    for (const part of chunk(symbols, MAX_SYMBOLS_PER_REQUEST)) {
      const response = await providerGet(fetchFn, buildTickerUrl(config.binanceBase, part), {
        accept: "application/json",
      });
      for (const row of parseTickerPrices(response, config.quote, utcDate(deps.now())).rows) {
        prices.set(row.instrument, row.price);
      }
    }
    const valuation = valueBalances(balances, prices, config.quote, config.minorDigits);

    // 3. Depósitos y retiradas de dinero (últimos 89 días; la API admite 90 por consulta).
    const flows: FlowItem[] = [];
    const window = {
      beginTime: String(nowMs - FIAT_WINDOW_DAYS * 86_400_000),
      endTime: String(nowMs),
      rows: "500",
    };
    for (const [type, direction] of [
      ["0", "deposit"],
      ["1", "withdrawal"],
    ] as const) {
      const response = await get("/sapi/v1/fiat/orders", { ...window, transactionType: type });
      flows.push(...parseFiatOrders(response, direction, config.quote, EXTERNAL_REF, config.minorDigits).flows);
    }

    // 4. Entrega a la base de datos: idempotente y con comprobación de cuentas y monedas.
    const ingested = await serviceRpc<unknown>(config, fetchFn, "ingest_sync", {
      p_connection_id: job.connection_id,
      p_payload: {
        flows,
        valuations: [
          {
            external_ref: EXTERNAL_REF,
            as_of: utcDate(deps.now()),
            value_minor: valuation.valueMinor.toString(),
            currency: config.quote,
          },
        ],
      },
    });
    if (!ingested.ok) throw new JobFailure("failed", "ingest_failed");
    return { flows: flows.length, unpriced: valuation.unpriced.length };
  } finally {
    privateKey.fill(0);
  }
}

async function finish(
  config: SyncConfig,
  fetchFn: Fetch,
  jobId: number,
  outcome: "done" | "retry" | "failed",
  code: string | null,
  retryAfterSeconds?: number,
): Promise<void> {
  await serviceRpc<unknown>(config, fetchFn, "finish_sync_job", {
    p_job_id: jobId,
    p_outcome: outcome,
    p_error_code: code,
    p_retry_in_seconds: retryAfterSeconds ?? null,
  });
}

/**
 * Procesa los trabajos listos de la cola. Protegida por un secreto compartido con la tarea
 * programada. La respuesta solo lleva contadores: nunca importes, cuentas ni credenciales.
 */
export async function handleSyncWorker(
  request: Request,
  config: SyncConfig,
  deps: SyncDeps,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const secret = request.headers.get("x-cron-secret") ?? "";
  if (config.cronSecret === "" || !(await safeEqual(secret, config.cronSecret))) {
    return json(401, { error: "unauthorized" });
  }

  const claimed = await serviceRpc<Job[]>(config, deps.fetchFn, "claim_sync_jobs", {
    p_limit: config.maxJobs,
  });
  if (!claimed.ok || !Array.isArray(claimed.data)) return json(502, { error: "claim_failed" });

  const summary = { claimed: claimed.data.length, done: 0, retried: 0, failed: 0 };
  for (const job of claimed.data) {
    try {
      if (job.provider !== "binance") throw new JobFailure("failed", "unsupported_provider");
      await syncBinance(job, config, deps);
      await finish(config, deps.fetchFn, job.job_id, "done", null);
      summary.done += 1;
    } catch (error) {
      const failure =
        error instanceof JobFailure ? error : new JobFailure("retry", "internal");
      await finish(config, deps.fetchFn, job.job_id, failure.outcome, failure.code, failure.retryAfterSeconds);
      if (failure.code === "key_not_readonly") {
        // Una clave con permisos de más ya no es de fiar: se revoca y se borra su secreto.
        await serviceRpc<unknown>(config, deps.fetchFn, "revoke_connection", {
          p_connection_id: job.connection_id,
        });
      }
      if (failure.outcome === "retry") summary.retried += 1;
      else summary.failed += 1;
    }
  }
  return json(200, summary);
}

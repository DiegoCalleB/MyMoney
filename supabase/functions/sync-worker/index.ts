// Edge Function programada (pg_cron + pg_net, cada minuto): procesa la cola de sincronizaciones.
// Usa la clave secreta de Supabase (regla 3) y las claves maestras de la bóveda; nada de esto sale
// de la función.
//
// Secretos de la función: SYNC_WORKER_SECRET (aleatorio, 32 bytes o más; lo envía quien programa la
// llamada en `x-cron-secret`), VAULT_KEK_V<n> (base64 de 32 bytes) y VAULT_KEK_CURRENT.
// Opcionales: SYNC_QUOTE (EUR), SYNC_MAX_JOBS (5), BINANCE_API_BASE.
import { loadKeks } from "../_shared/vault.ts";
import { handleSyncWorker } from "../_shared/sync-worker.ts";

Deno.serve(async (request) =>
  handleSyncWorker(
    request,
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      cronSecret: Deno.env.get("SYNC_WORKER_SECRET") ?? "",
      binanceBase: Deno.env.get("BINANCE_API_BASE") ?? "https://api.binance.com",
      quote: Deno.env.get("SYNC_QUOTE") ?? "EUR",
      minorDigits: 2,
      maxJobs: Number(Deno.env.get("SYNC_MAX_JOBS") ?? "5"),
    },
    {
      fetchFn: fetch,
      now: () => new Date(),
      keks: await loadKeks((name) => Deno.env.get(name)),
    },
  ),
);

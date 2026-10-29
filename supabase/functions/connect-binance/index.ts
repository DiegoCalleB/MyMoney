// Edge Function que llama la web (Server Action) con el JWT de la persona para conectar Binance.
// Comprueba permisos con ese JWT y solo entonces usa la clave secreta de Supabase (regla 3).
//
// Secretos de la función: VAULT_KEK_V<n> y VAULT_KEK_CURRENT (como sync-worker). SUPABASE_URL,
// SUPABASE_ANON_KEY (o la clave publicable) y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
import { loadKeks } from "../_shared/vault.ts";
import { handleConnectBinance } from "../_shared/connect-binance.ts";

Deno.serve(async (request) =>
  handleConnectBinance(
    request,
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      publishableKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      binanceBase: Deno.env.get("BINANCE_API_BASE") ?? "https://api.binance.com",
    },
    { fetchFn: fetch, now: () => new Date(), keks: await loadKeks((name) => Deno.env.get(name)) },
  ),
);

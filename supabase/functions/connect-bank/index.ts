// Edge Function que llama la web (Server Action) con el JWT de la persona para conectar un banco por
// PSD2 con Enable Banking. Secretos: ENABLE_BANKING_APP_ID, ENABLE_BANKING_PRIVATE_KEY (PEM PKCS8),
// APP_ORIGIN (la web, p. ej. https://tu-servicio.up.railway.app), VAULT_KEK_V<n> y VAULT_KEK_CURRENT.
import { handleConnectBank } from "../_shared/connect-bank.ts";
import { loadKeks } from "../_shared/vault.ts";

Deno.serve(async (request) =>
  handleConnectBank(
    request,
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      publishableKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      applicationId: Deno.env.get("ENABLE_BANKING_APP_ID") ?? "",
      privateKeyPem: Deno.env.get("ENABLE_BANKING_PRIVATE_KEY") ?? "",
      redirectUrl: `${Deno.env.get("APP_ORIGIN") ?? ""}/conexiones/retorno`,
      apiBase: Deno.env.get("ENABLE_BANKING_API_BASE") ?? "https://api.enablebanking.com",
    },
    { fetchFn: fetch, now: () => new Date(), keks: await loadKeks((name) => Deno.env.get(name)) },
  ),
);

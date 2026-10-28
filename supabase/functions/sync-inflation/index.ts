// Carga el IPC del INE en `ref.inflation_index` (ADR-0023). Se invoca a mano o por un cron
// mensual de Supabase. Usa la clave de servicio, que solo existe en este entorno (regla 3).
// Despliegue: solo con confirmación explícita y primero en staging (regla 12).
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import {
  ineCpiUrl,
  parseIneCpi,
} from "../../../packages/importers/src/ine-cpi.ts";

const COUNTRY = "ES";
// Con el valor de un secreto compartido (SYNC_INFLATION_TOKEN) en la cabecera Authorization.
const TOKEN = Deno.env.get("SYNC_INFLATION_TOKEN");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (!TOKEN || request.headers.get("authorization") !== `Bearer ${TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const response = await fetch(ineCpiUrl(), { headers: { accept: "application/json" } });
  if (!response.ok) return json({ error: "ine_unavailable", status: response.status }, 502);

  const parsed = parseIneCpi(await response.json());
  // Un fallo de formato no escribe nada: mejor sin dato nuevo que con un índice dudoso.
  if (!parsed.ok) return json({ error: parsed.error.code, params: parsed.error.params }, 502);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const { data, error } = await supabase.rpc("upsert_inflation_index", {
    p_country: COUNTRY,
    p_series_code: parsed.value.series,
    p_rows: parsed.value.observations.map((o) => ({ period: o.period, index: o.index })),
  });
  if (error) return json({ error: "database", code: error.code }, 500);

  const last = parsed.value.observations.at(-1);
  return json({ changed: data, received: parsed.value.observations.length, latest: last?.period });
});

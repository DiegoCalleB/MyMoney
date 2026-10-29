// Edge Function programada (pg_cron + pg_net): guarda en ref.prices los precios de mercado de los
// criptoactivos. Es de las pocas piezas que usan la clave secreta de Supabase (regla 3).
//
// Variables (secretos de la función): SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las pone Supabase;
// PRICE_FEED_SECRET es un secreto largo y aleatorio que debe enviar quien la programe en la
// cabecera `x-cron-secret`. PRICE_FEED_QUOTE (EUR por defecto) y BINANCE_API_BASE son opcionales.
import { handleUpdatePrices } from "../_shared/update-prices.ts";

Deno.serve((request) =>
  handleUpdatePrices(
    request,
    {
      supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      cronSecret: Deno.env.get("PRICE_FEED_SECRET") ?? "",
      quote: Deno.env.get("PRICE_FEED_QUOTE") ?? "EUR",
      binanceBase: Deno.env.get("BINANCE_API_BASE") ?? "https://api.binance.com",
    },
    fetch,
    new Date(),
  ),
);

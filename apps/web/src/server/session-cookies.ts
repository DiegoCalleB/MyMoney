import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Las cookies de sesión son `httpOnly`: la web solo lee datos desde el servidor (ADR-0004),
 * así que ningún script del navegador necesita el token (amenaza T3).
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, createNonce } from "@/lib/csp";
import { readPublicEnv } from "@/lib/env";
import { SESSION_COOKIE_OPTIONS } from "@/server/session-cookies";

/** Rutas que exigen sesión. La comprobación de verdad la repite cada página (defensa en profundidad). */
const PROTECTED_PREFIXES = ["/s/", "/hogares", "/seguridad", "/verificar-mfa"];

export async function proxy(request: NextRequest) {
  const env = readPublicEnv();
  const nonce = createNonce();
  const csp = buildCsp(nonce, {
    dev: process.env.NODE_ENV === "development",
    ...(env ? { supabaseUrl: env.url } : {}),
  });

  // Next.js lee el nonce de la cabecera CSP de la petición y lo aplica a sus scripts.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();
  let signedIn = false;

  if (env) {
    const supabase = createServerClient(env.url, env.publishableKey, {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = forward();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    });
    // Refresca la sesión y verifica la firma del JWT; no confiar en getSession() (cookies).
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims.sub);
  }

  const path = request.nextUrl.pathname;
  if (!signedIn && PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.headers.set("Content-Security-Policy", csp);
  // Las páginas pueden llevar datos financieros: que no queden en cachés (plan §6).
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: [
    {
      // La comprobación de salud, el manifiesto y los iconos quedan fuera: no deben consultar a
      // Supabase en cada llamada ni exigen sesión.
      source:
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|api/health|manifest.webmanifest|icons/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

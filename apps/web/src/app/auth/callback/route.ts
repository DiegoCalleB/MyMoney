import { NextResponse, type NextRequest } from "next/server";
import { readAppOrigin } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/server/supabase";

/**
 * Destino del enlace del correo de confirmación (flujo PKCE): canjea el código por la sesión.
 * El destino final es fijo: no se acepta ningún parámetro de redirección (evita redirecciones
 * abiertas). El enlace debe abrirse en el mismo navegador donde se creó la cuenta.
 */
export async function GET(request: NextRequest) {
  const origin = readAppOrigin();
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/hogares", origin));
    logger.warn("auth.callback_failed", {
      code: error.code ?? "unknown",
      status: error.status ?? 0,
    });
  }
  return NextResponse.redirect(new URL("/entrar?error=callback", origin));
}

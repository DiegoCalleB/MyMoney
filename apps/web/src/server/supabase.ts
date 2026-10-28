import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readPublicEnv } from "@/lib/env";
import { SESSION_COOKIE_OPTIONS } from "./session-cookies";

/** Cliente con el JWT del usuario: RLS decide qué ve. Nunca la clave secreta (regla 3). */
export async function createSupabaseServerClient() {
  const env = readPublicEnv();
  if (!env) throw new Error("Falta la configuración de Supabase");
  const cookieStore = await cookies();
  return createServerClient(env.url, env.publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // En un Server Component no se pueden escribir cookies; el proxy ya refrescó la sesión.
        }
      },
    },
  });
}

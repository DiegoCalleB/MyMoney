import { z } from "zod";

/**
 * Configuración pública de Supabase. Solo la URL y la clave PUBLICABLE: la clave secreta
 * nunca se lee en la web (regla 3) y este módulo no la conoce.
 */
const publicEnv = z.object({
  url: z.url(),
  publishableKey: z
    .string()
    .min(20)
    .refine((k) => !k.startsWith("sb_secret_"), { error: "Clave secreta en la web: prohibido" }),
});

export type PublicEnv = z.infer<typeof publicEnv>;

/** `null` si falta la configuración: las páginas públicas siguen funcionando sin ella. */
export function readPublicEnv(
  source: Record<string, string | undefined> = process.env,
): PublicEnv | null {
  const parsed = publicEnv.safeParse({
    url: source.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (parsed.success) return parsed.data;
  if (source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_secret_")) {
    throw new Error("Configuración insegura: clave secreta de Supabase en la web");
  }
  return null;
}

/**
 * Origen público de la web, para los enlaces de los correos de confirmación. Debe ser una
 * dirección absoluta sin ruta; si falta, se usa la local de desarrollo.
 */
export function readAppOrigin(source: Record<string, string | undefined> = process.env): string {
  const raw = source.APP_ORIGIN;
  if (!raw) return "http://localhost:3000";
  const url = new URL(raw);
  if (url.pathname !== "/" || url.search || url.hash || !/^https?:$/.test(url.protocol)) {
    throw new Error("APP_ORIGIN debe ser un origen http(s) sin ruta");
  }
  return url.origin;
}

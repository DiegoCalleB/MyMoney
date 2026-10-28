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
  // Se recortan los espacios: al pegar valores en un panel es el error más habitual.
  const parsed = publicEnv.safeParse({
    url: source.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    publishableKey: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  });
  if (parsed.success) return parsed.data;
  if (source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim().startsWith("sb_secret_")) {
    throw new Error("Configuración insegura: clave secreta de Supabase en la web");
  }
  return null;
}

/**
 * Qué variables públicas de Supabase fallan y por qué, solo con sus nombres (nunca valores):
 * sirve para diagnosticar una configuración errónea sin filtrar nada.
 */
export function describePublicEnv(
  source: Record<string, string | undefined> = process.env,
): string[] {
  const problems: string[] = [];
  const url = source.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) problems.push("NEXT_PUBLIC_SUPABASE_URL:missing");
  else if (!z.url().safeParse(url).success) problems.push("NEXT_PUBLIC_SUPABASE_URL:invalid");
  const key = source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:missing");
  else if (key.startsWith("sb_secret_"))
    problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:secret");
  else if (key.length < 20) problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:invalid");
  return problems;
}

/**
 * Origen público de la web, para los enlaces de los correos de confirmación. Debe ser una
 * dirección absoluta sin ruta. Si falta, solo en desarrollo se usa la local.
 */
export function readAppOrigin(source: Record<string, string | undefined> = process.env): string {
  // Se toleran los fallos típicos al pegar en un panel: comillas y falta de "https://".
  let raw = source.APP_ORIGIN?.trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (raw && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  if (!raw) {
    // En producción, un origen por defecto enviaría los enlaces del correo a localhost.
    if (source.NODE_ENV === "production") throw new Error("Falta APP_ORIGIN");
    return "http://localhost:3000";
  }
  const url = new URL(raw);
  if (url.pathname !== "/" || url.search || url.hash || !/^https?:$/.test(url.protocol)) {
    throw new Error("APP_ORIGIN debe ser un origen http(s) sin ruta");
  }
  return url.origin;
}

/**
 * ¿Es obligatorio el segundo factor? Sí, salvo que `MFA_REQUIRED` valga `false`, `0` o `no`.
 * Es un interruptor deliberado y reversible para uso con una sola persona: quien ya tenga un
 * factor activado sigue teniendo que verificarlo; solo se deja entrar sin él a quien aún no
 * lo ha activado.
 */
export function readMfaRequired(source: Record<string, string | undefined> = process.env): boolean {
  const value = source.MFA_REQUIRED?.trim().toLowerCase();
  return !(value === "false" || value === "0" || value === "no");
}

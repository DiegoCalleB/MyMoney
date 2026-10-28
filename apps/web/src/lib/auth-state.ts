/** Supabase admite cualquier cadena; solo "aal2" cuenta como segundo factor verificado. */
export type AssuranceLevel = string | null;

/**
 * Qué puede hacer una persona con sesión según su nivel de autenticación. Hoy el MFA es
 * obligatorio para entrar a los datos (condición para usar datos reales, plan §6):
 * - `ready`: sesión verificada con segundo factor.
 * - `verify`: tiene un factor TOTP y falta introducir el código en esta sesión.
 * - `enroll`: aún no tiene ningún factor; debe activarlo antes de continuar.
 */
export type SessionState = "ready" | "verify" | "enroll";

export function decideSession(current: AssuranceLevel, next: AssuranceLevel): SessionState {
  if (current === "aal2") return "ready";
  if (next === "aal2") return "verify";
  return "enroll";
}

export const ROUTE_FOR_STATE = {
  verify: "/verificar-mfa",
  enroll: "/seguridad/mfa",
} as const satisfies Record<Exclude<SessionState, "ready">, string>;

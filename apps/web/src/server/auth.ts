import "server-only";
import { redirect } from "next/navigation";
import { ROUTE_FOR_STATE, decideSession, type SessionState } from "@/lib/auth-state";
import { createSupabaseServerClient } from "./supabase";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type AuthState =
  | { readonly kind: "anonymous"; readonly supabase: SupabaseClient }
  | { readonly kind: SessionState; readonly supabase: SupabaseClient; readonly userId: string };

/**
 * Estado de la sesión. La identidad sale de `getClaims()`, que verifica la firma del JWT: no se
 * confía en lo que haya en la cookie (amenaza T3). El nivel de autenticación sale de Supabase.
 */
export async function getAuthState(): Promise<AuthState> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return { kind: "anonymous", supabase };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    kind: decideSession(aal?.currentLevel ?? null, aal?.nextLevel ?? null),
    supabase,
    userId,
  };
}

/** Exige sesión con segundo factor verificado; si no, lleva a donde corresponda. */
export async function requireReadyUser(): Promise<{ supabase: SupabaseClient; userId: string }> {
  const state = await getAuthState();
  if (state.kind === "anonymous") redirect("/entrar");
  if (state.kind !== "ready") redirect(ROUTE_FOR_STATE[state.kind]);
  return { supabase: state.supabase, userId: state.userId };
}

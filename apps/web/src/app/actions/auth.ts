"use server";

import { newPasswordInput, resetRequestInput, signInInput, signUpInput } from "@mymoney/schemas";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { RECOVERY_COOKIE } from "@/lib/auth-state";
import { describePublicEnv, readAppOrigin } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getAuthState } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase";

/**
 * Cliente de Supabase o `null` si la configuración falta o es inválida. Así un fallo de
 * configuración se ve como "servicio no disponible" y deja una pista en los registros, en
 * lugar de una página de error genérica.
 */
async function clientOrNull() {
  try {
    return await createSupabaseServerClient();
  } catch {
    logger.error("auth.client_unavailable", {
      code: "supabase_config",
      detail: describePublicEnv().join(",") || "unknown",
    });
    return null;
  }
}

/** Texto para la persona: distingue la configuración de Supabase de otros fallos. */
function unavailableMessage(): string {
  return describePublicEnv().length > 0 ? "auth.unavailable_config" : "auth.unavailable";
}

/** Origen público para los enlaces de correo, o `null` si `APP_ORIGIN` no es válido. */
function originOrNull(): string | null {
  try {
    return readAppOrigin();
  } catch {
    logger.error("auth.origin_invalid", { code: "app_origin", detail: "APP_ORIGIN" });
    return null;
  }
}

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpInput.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const supabase = await clientOrNull();
  const origin = originOrNull();
  if (!supabase) return { error: unavailableMessage() };
  if (!origin) return { error: "auth.unavailable_origin" };
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    logger.warn("auth.sign_up_failed", {
      code: error.code ?? "unknown",
      status: error.status ?? 0,
    });
    return {
      error: error.code === "signup_disabled" ? "auth.sign_up_closed" : "auth.sign_up_failed",
    };
  }
  // Mismo resultado exista o no el correo: no se revela quién tiene cuenta.
  redirect("/verifica-correo");
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInInput.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
  });
  if (!parsed.success) return { error: "auth.invalid_credentials" };

  const supabase = await clientOrNull();
  if (!supabase) return { error: unavailableMessage() };
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logger.warn("auth.sign_in_failed", {
      code: error.code ?? "unknown",
      status: error.status ?? 0,
    });
    // Mensaje neutro para cualquier fallo: no distingue correo inexistente de contraseña errónea.
    return { error: "auth.invalid_credentials" };
  }
  redirect("/hogares");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

/**
 * Pide el enlace para elegir una nueva contraseña. Se marca el navegador con una cookie para que,
 * al volver del correo, el callback lleve a elegirla; el enlace (PKCE) solo vale en este navegador.
 * La respuesta es la misma exista o no la cuenta: no se revela quién tiene cuenta.
 */
export async function requestPasswordResetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetRequestInput.safeParse({ email: formText(formData, "email") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const supabase = await clientOrNull();
  const origin = originOrNull();
  if (!supabase) return { error: unavailableMessage() };
  if (!origin) return { error: "auth.unavailable_origin" };
  (await cookies()).set(RECOVERY_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/auth",
    maxAge: 60 * 60,
  });
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback`,
  });
  if (error) {
    logger.warn("auth.reset_request_failed", {
      code: error.code ?? "unknown",
      status: error.status ?? 0,
    });
    // Un límite de envíos o un fallo del servicio se dicen; no depende de si existe la cuenta.
    if (error.status === 429 || (error.status ?? 0) >= 500) return { error: "auth.forgot.failed" };
  }
  redirect("/verifica-correo?tipo=recuperar");
}

/** Guarda la nueva contraseña con la sesión que abrió el enlace del correo. */
export async function updatePasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = newPasswordInput.safeParse({ password: formText(formData, "password") });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const state = await getAuthState();
  if (state.kind === "anonymous") redirect("/entrar?error=callback");
  // Con segundo factor, primero se verifica el código y luego se vuelve aquí.
  if (state.kind === "verify") redirect("/verificar-mfa?next=restablecer");
  const { error } = await state.supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    logger.warn("auth.reset_failed", { code: error.code ?? "unknown", status: error.status ?? 0 });
    return {
      error: error.code === "same_password" ? "auth.reset.same_password" : "auth.reset.failed",
    };
  }
  redirect("/hogares");
}

"use server";

import { signInInput, signUpInput } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { readAppOrigin } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/server/supabase";

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpInput.safeParse({
    email: formText(formData, "email"),
    password: formText(formData, "password"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${readAppOrigin()}/auth/callback` },
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

  const supabase = await createSupabaseServerClient();
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

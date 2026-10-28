"use server";

import { totpCodeInput } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { logger } from "@/lib/logger";
import { safeOtpauthUri } from "@/lib/qr";
import { getAuthState } from "@/server/auth";

export interface EnrollState extends FormState {
  readonly enroll?: {
    readonly factorId: string;
    readonly secret: string;
    /** Enlace para abrir la aplicación de autenticación con un toque, si es seguro. */
    readonly uri: string | null;
  };
}

/** Empieza la activación de TOTP. Repetirla no acumula factores: se retiran los no verificados. */
export async function startEnrollAction(): Promise<EnrollState> {
  const state = await getAuthState();
  if (state.kind === "anonymous") redirect("/entrar");
  if (state.kind !== "enroll") redirect("/hogares");

  const { supabase } = state;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Aplicación de autenticación",
  });
  if (error) {
    logger.warn("mfa.enroll_failed", { code: error.code ?? "unknown", status: error.status ?? 0 });
    return { error: "mfa.enroll.failed" };
  }
  return {
    enroll: {
      factorId: data.id,
      secret: data.totp.secret,
      uri: safeOtpauthUri(data.totp.uri),
    },
  };
}

/** Verifica un código TOTP: sirve para terminar la activación y para entrar en cada sesión. */
export async function verifyTotpAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = totpCodeInput.safeParse({
    factorId: formText(formData, "factorId"),
    code: formText(formData, "code"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);

  const state = await getAuthState();
  if (state.kind === "anonymous") redirect("/entrar");
  const { error } = await state.supabase.auth.mfa.challengeAndVerify(parsed.data);
  if (error) {
    logger.warn("mfa.verify_failed", { code: error.code ?? "unknown", status: error.status ?? 0 });
    return { error: "mfa.verify.wrong" };
  }
  redirect("/hogares");
}

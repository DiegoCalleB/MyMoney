import { z } from "zod";

/** Plan §6: contraseña de al menos 12 caracteres; se permite pegar y usar gestores. */
export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "validation.email_invalid" }));

export const signUpInput = z.object({
  email,
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, { error: "validation.password_too_short" })
    .max(PASSWORD_MAX_LENGTH, { error: "validation.password_too_long" }),
});
export type SignUpInput = z.infer<typeof signUpInput>;

/** Al iniciar sesión no se revela la política: cualquier fallo da el mismo mensaje neutro. */
export const signInInput = z.object({
  email,
  password: z
    .string()
    .min(1, { error: "auth.invalid_credentials" })
    .max(PASSWORD_MAX_LENGTH, { error: "auth.invalid_credentials" }),
});
export type SignInInput = z.infer<typeof signInInput>;

export const totpCodeInput = z.object({
  factorId: z.string().trim().min(1, { error: "validation.invalid_id" }).max(64),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: "validation.totp_invalid" }),
});
export type TotpCodeInput = z.infer<typeof totpCodeInput>;

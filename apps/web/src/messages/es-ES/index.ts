/**
 * Catálogo de textos en español de España. Claves estables: las usan los esquemas Zod como
 * mensajes de error y la interfaz nunca muestra texto técnico. Los avisos (regla 21) también
 * vivirán aquí, revisados, y no se generan libremente.
 */
export const esES = {
  "app.name": "MyMoney",
  "app.tagline": "Dónde está tu dinero y para qué sirve, sin complicaciones.",
  "app.skip_to_content": "Saltar al contenido",
  "app.disclaimer":
    "MyMoney ofrece información y herramientas de cálculo. No recomienda productos concretos.",

  "landing.title": "Tu patrimonio, claro y en un solo sitio",
  "landing.sign_up": "Crear cuenta",
  "landing.sign_in": "Entrar",

  "error.title": "Algo no ha ido bien",
  "error.body": "No hemos podido completar la acción. Puedes intentarlo de nuevo.",
  "error.reference": "Referencia para soporte: {digest}",
  "error.retry": "Reintentar",
  "not_found.title": "No encontramos esta página",
  "not_found.back": "Volver al inicio",

  "validation.invalid_id": "El identificador no es válido.",
  "validation.currency_invalid": "Elige una moneda válida.",
  "validation.amount_required": "Escribe un importe.",
  "validation.amount_invalid": "Escribe el importe con números, por ejemplo 1.234,56.",
  "validation.name_required": "Escribe un nombre.",
  "validation.name_too_long": "El nombre puede tener como máximo 80 caracteres.",
  "validation.email_invalid": "Escribe un correo electrónico válido.",
  "validation.password_too_short": "La contraseña debe tener al menos 12 caracteres.",
  "validation.password_too_long": "La contraseña puede tener como máximo 128 caracteres.",
  "validation.totp_invalid": "El código tiene 6 cifras.",
  "validation.account_kind_invalid": "Elige un tipo de cuenta.",
  "auth.invalid_credentials": "El correo o la contraseña no son correctos.",
} as const;

export type MessageKey = keyof typeof esES;

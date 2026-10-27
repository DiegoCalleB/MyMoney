import type { ZodError } from "zod";

/** Estado devuelto por las Server Actions: solo claves del catálogo de textos, nunca detalles técnicos. */
export interface FormState {
  readonly error?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export const INITIAL_FORM_STATE: FormState = {};

/** Primer error de cada campo, como clave del catálogo. */
export function fieldErrorsFrom(error: ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= issue.message;
  }
  return { fieldErrors };
}

/** Texto de un campo de formulario; cualquier otra cosa (archivos, ausencia) cuenta como vacío. */
export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

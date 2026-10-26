/** Resultado de una operación que puede fallar de forma esperable (sin datos, sin tipo de cambio…). */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Error de dominio con un código estable (para i18n) y parámetros para el mensaje. */
export interface DomainError {
  readonly code: string;
  readonly params?: Readonly<Record<string, string>>;
}

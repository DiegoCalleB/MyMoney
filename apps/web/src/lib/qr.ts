/**
 * Enlace `otpauth://` que abre la aplicación de autenticación con un toque. Solo se acepta ese
 * esquema: cualquier otro valor (p. ej. `javascript:`) se descarta.
 */
export function safeOtpauthUri(uri: string): string | null {
  return /^otpauth:\/\/totp\/[^\s]+$/i.test(uri) ? uri : null;
}

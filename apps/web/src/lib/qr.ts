/** Convierte el QR de Supabase (SVG o ya URL de datos) en una URL de datos para <img>. */
export function qrToDataUrl(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
}

/**
 * Enlace `otpauth://` que abre la aplicación de autenticación con un toque. Solo se acepta ese
 * esquema: cualquier otro valor (p. ej. `javascript:`) se descarta.
 */
export function safeOtpauthUri(uri: string): string | null {
  return /^otpauth:\/\/totp\/[^\s]+$/i.test(uri) ? uri : null;
}

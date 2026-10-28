/**
 * Política de seguridad de contenidos con nonce por petición (plan §6, amenaza T3).
 * Sin 'unsafe-inline' en scripts ni estilos: los atributos `style` en línea están prohibidos.
 */
export function buildCsp(nonce: string, options: { dev: boolean; supabaseUrl?: string }): string {
  const connect = ["'self'", ...(options.supabaseUrl ? [options.supabaseUrl] : [])];
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/** Nonce impredecible: 128 bits aleatorios en base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

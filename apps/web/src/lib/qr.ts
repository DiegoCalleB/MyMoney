/** Convierte el QR de Supabase (SVG o ya URL de datos) en una URL de datos para <img>. */
export function qrToDataUrl(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
}

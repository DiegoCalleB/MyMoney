// Utilidades de bytes sin dependencias, para Deno y Node.

/** Bytes sobre un `ArrayBuffer` propio: es lo que aceptan las API de WebCrypto. */
export type Bytes = Uint8Array<ArrayBuffer>;

const HEX = /^(?:[0-9a-f]{2})*$/i;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Bytes {
  if (!HEX.test(hex)) throw new RangeError("Hexadecimal no válido");
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

/** `bytea` tal como lo envía y devuelve PostgREST: `\x` más hexadecimal. */
export function toBytea(bytes: Uint8Array): string {
  return `\\x${toHex(bytes)}`;
}

export function fromBytea(value: string): Bytes {
  if (!value.startsWith("\\x")) throw new RangeError("bytea no válido");
  return fromHex(value.slice(2));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Bytes {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function utf8(text: string): Bytes {
  return encoder.encode(text);
}

export function text(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** Pone a cero un búfer con material sensible en cuanto deja de hacer falta (mejor esfuerzo). */
export function wipe(bytes: Uint8Array): void {
  bytes.fill(0);
}

import { esES, type MessageKey } from "@/messages/es-ES";

export type { MessageKey };

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(esES, key);
}

/** Texto del catálogo con parámetros `{nombre}`. Una clave desconocida da un error genérico. */
/** Acepta cualquier cadena porque las claves también llegan como mensajes de error de Zod. */
export function t(key: string, params: Readonly<Record<string, string>> = {}): string {
  const template: string = isMessageKey(key) ? esES[key] : esES["error.body"];
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}

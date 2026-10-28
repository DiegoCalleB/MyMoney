import { createHmac } from "node:crypto";

/**
 * Logger con lista blanca de campos (regla 8): nunca importes, nombres, correos, descripciones
 * ni tokens. Los identificadores de usuario y espacio solo salen seudonimizados con HMAC.
 */
const ALLOWED_FIELDS = [
  "route",
  "status",
  "latencyMs",
  "requestId",
  "code",
  "digest",
  /** Códigos cortos de diagnóstico, p. ej. nombres de variables de entorno (nunca valores). */
  "detail",
] as const;
type AllowedField = (typeof ALLOWED_FIELDS)[number];
type FieldValue = string | number | boolean;

export type LogFields = Partial<Record<AllowedField, FieldValue>> & {
  /** Identificador real; se registra solo como `userRef` seudónimo. */
  userId?: string;
  /** Identificador real; se registra solo como `spaceRef` seudónimo. */
  spaceId?: string;
};

type Level = "info" | "warn" | "error";
type Sink = (line: string) => void;

const defaultSinks: Record<Level, Sink> = {
  info: (line) => {
    console.info(line);
  },
  warn: (line) => {
    console.warn(line);
  },
  error: (line) => {
    console.error(line);
  },
};

/** HMAC-SHA256 truncado: permite correlacionar sin revelar el identificador. */
export function pseudonymize(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("hex").slice(0, 16);
}

/** El evento es un código estable (p. ej., "auth.sign_in_failed"), nunca texto libre. */
const EVENT = /^[a-z0-9_.]{1,64}$/;

export function createLogger(options: { secret?: string; sinks?: Partial<Record<Level, Sink>> }) {
  const sinks = { ...defaultSinks, ...options.sinks };

  function write(level: Level, event: string, fields: LogFields = {}): void {
    const record: Record<string, FieldValue> = {
      level,
      event: EVENT.test(event) ? event : "invalid_event",
    };
    for (const key of ALLOWED_FIELDS) {
      const value = fields[key];
      if (value !== undefined) record[key] = value;
    }
    // Sin secreto no se registra ninguna referencia: mejor perder correlación que filtrar ids.
    if (options.secret) {
      if (fields.userId) record.userRef = pseudonymize(fields.userId, options.secret);
      if (fields.spaceId) record.spaceRef = pseudonymize(fields.spaceId, options.secret);
    }
    sinks[level](JSON.stringify(record));
  }

  return {
    info: (event: string, fields?: LogFields) => {
      write("info", event, fields);
    },
    warn: (event: string, fields?: LogFields) => {
      write("warn", event, fields);
    },
    error: (event: string, fields?: LogFields) => {
      write("error", event, fields);
    },
  };
}

export const logger = createLogger(
  process.env.LOG_PSEUDONYM_SECRET ? { secret: process.env.LOG_PSEUDONYM_SECRET } : {},
);

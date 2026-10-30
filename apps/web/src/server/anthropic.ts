import "server-only";
import type { AssistantEnv } from "@/lib/env";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 700;

export type ClaudeResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly code: string };

interface Turn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * Pregunta a Claude por HTTP, sin SDK (una dependencia menos, regla 11). Devuelve solo el texto o
 * un código de fallo: nunca el cuerpo de la respuesta de error, que podría repetir lo enviado.
 */
export async function askClaude(
  env: AssistantEnv,
  system: string,
  messages: readonly Turn[],
  fetcher: typeof fetch = fetch,
): Promise<ClaudeResult> {
  try {
    const response = await fetcher(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: env.model, max_tokens: MAX_TOKENS, system, messages }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, code: `http_${String(response.status)}` };
    const body: unknown = await response.json();
    return extractText(body);
  } catch {
    return { ok: false, code: "network" };
  }
}

/** Texto de la respuesta: une los bloques de tipo `text`. */
export function extractText(body: unknown): ClaudeResult {
  const content = (body as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return { ok: false, code: "bad_shape" };
  const text = content
    .map((block: unknown) => {
      const b = block as { type?: unknown; text?: unknown };
      return b.type === "text" && typeof b.text === "string" ? b.text : "";
    })
    .join("")
    .trim();
  return text === "" ? { ok: false, code: "empty" } : { ok: true, text };
}

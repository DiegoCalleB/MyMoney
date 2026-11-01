import "server-only";
import type { AssistantEnv } from "@/lib/env";
import type { LlmResult, LlmTurn } from "@/server/llm-types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 30_000;
// Los modelos con «razonamiento» gastan parte del límite pensando: se deja margen.
const MAX_TOKENS = 1500;

/**
 * Pregunta a Gemini por HTTP, sin SDK. La clave va en la cabecera, nunca en la dirección (que
 * acaba en registros). Devuelve solo el texto o un código de fallo, nunca el cuerpo del error.
 */
export async function askGemini(
  env: AssistantEnv,
  system: string,
  messages: readonly LlmTurn[],
  fetcher: typeof fetch = fetch,
): Promise<LlmResult> {
  try {
    const response = await fetcher(`${ENDPOINT}/${encodeURIComponent(env.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, code: `http_${String(response.status)}` };
    const body: unknown = await response.json();
    return extractGeminiText(body);
  } catch {
    return { ok: false, code: "network" };
  }
}

/** Texto de la primera respuesta; distingue lo bloqueado por el servicio de lo vacío. */
export function extractGeminiText(body: unknown): LlmResult {
  const root = body as {
    candidates?: { content?: { parts?: { text?: unknown }[] } }[];
    promptFeedback?: { blockReason?: unknown };
  } | null;
  if (root?.promptFeedback?.blockReason) return { ok: false, code: "blocked_by_provider" };
  const parts = root?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return { ok: false, code: "bad_shape" };
  const text = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
  return text === "" ? { ok: false, code: "empty" } : { ok: true, text };
}

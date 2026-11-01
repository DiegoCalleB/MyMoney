import "server-only";
import type { AssistantEnv } from "@/lib/env";
import { askClaude } from "@/server/anthropic";
import { askGemini } from "@/server/gemini";
import type { LlmResult, LlmTurn } from "@/server/llm-types";

/** Pregunta al servicio de IA configurado (Gemini o Claude); ambos devuelven texto o un código. */
export function askModel(
  env: AssistantEnv,
  system: string,
  messages: readonly LlmTurn[],
  fetcher: typeof fetch = fetch,
): Promise<LlmResult> {
  return env.provider === "gemini"
    ? askGemini(env, system, messages, fetcher)
    : askClaude(env, system, messages, fetcher);
}

"use server";

import { assistantInput, type AssistantInput } from "@mymoney/schemas";
import { logger } from "@/lib/logger";
import { readAssistantEnv } from "@/lib/env";
import {
  ASSISTANT_SYSTEM_PROMPT,
  createRateLimiter,
  factsBlock,
  guardReply,
} from "@/server/assistant-model";
import { askClaude } from "@/server/anthropic";
import { requireReadyUser } from "@/server/auth";
import { loadAssistantFacts } from "@/server/queries/assistant";

export type AssistantReply =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly error: string };

/** 20 preguntas por hora y persona: frena abusos y el gasto de la API. En memoria, por instancia. */
const limiter = createRateLimiter(20, 60 * 60 * 1000);

/**
 * Responde una pregunta del asistente educativo (ADR-0025). La conversación llega sin estado y se
 * valida; al modelo solo viajan los mensajes y cifras agregadas redondeadas (sin nombres de
 * cuentas, entidades ni movimientos). La respuesta pasa por el filtro antes de mostrarse.
 */
export async function askAssistantAction(raw: AssistantInput): Promise<AssistantReply> {
  const { supabase, userId } = await requireReadyUser();
  const parsed = assistantInput.safeParse(raw);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "assistant.failed" };

  const env = readAssistantEnv();
  if (!env) return { ok: false, error: "assistant.unavailable" };
  if (!limiter.allow(userId, Date.now())) return { ok: false, error: "assistant.rate_limited" };

  const data = await loadAssistantFacts(supabase, parsed.data.spaceId);
  if (!data) return { ok: false, error: "assistant.failed" };

  const started = Date.now();
  const answer = await askClaude(
    env,
    `${ASSISTANT_SYSTEM_PROMPT}\n\n${factsBlock(data.source)}`,
    parsed.data.messages,
  );
  logger.info("assistant.answered", {
    userId,
    spaceId: parsed.data.spaceId,
    latencyMs: Date.now() - started,
    status: answer.ok ? 200 : 502,
    ...(answer.ok ? {} : { code: answer.code }),
  });
  if (!answer.ok) return { ok: false, error: "assistant.failed" };

  const checked = guardReply(answer.text);
  if (!checked.ok) {
    logger.warn("assistant.blocked", { userId, spaceId: parsed.data.spaceId });
    return { ok: false, error: "assistant.blocked" };
  }
  return { ok: true, text: checked.text };
}

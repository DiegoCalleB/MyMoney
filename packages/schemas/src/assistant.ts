import { z } from "zod";
import { uuid } from "./common";

/** Longitud máxima de un mensaje y de una conversación que se envía al asistente. */
export const ASSISTANT_MAX_MESSAGE = 1500;
export const ASSISTANT_MAX_TURNS = 12;

const turn = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .trim()
    .min(1, { error: "assistant.message_empty" })
    .max(ASSISTANT_MAX_MESSAGE, { error: "assistant.message_too_long" }),
});

/** Conversación sin estado: el cliente reenvía los últimos turnos y el servidor los valida. */
export const assistantInput = z.object({
  spaceId: uuid,
  messages: z
    .array(turn)
    .min(1, { error: "assistant.message_empty" })
    .max(ASSISTANT_MAX_TURNS, { error: "assistant.conversation_too_long" })
    .refine((m) => m.at(-1)?.role === "user", { error: "assistant.invalid_conversation" }),
});
export type AssistantInput = z.infer<typeof assistantInput>;

/** Parámetros del simulador de caminos (texto de la URL → números, con límites). */
export const pathSimulatorInput = z.object({
  amount: z.string().trim().min(1).max(32),
  months: z.coerce.number().int().min(2).max(60),
  annualReturn: z.coerce.number().min(-50).max(50),
  drop: z.coerce.number().min(0).max(90),
});

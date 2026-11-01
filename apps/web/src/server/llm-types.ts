export interface LlmTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export type LlmResult =
  { readonly ok: true; readonly text: string } | { readonly ok: false; readonly code: string };

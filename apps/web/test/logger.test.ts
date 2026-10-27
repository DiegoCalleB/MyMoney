import { describe, expect, it } from "vitest";
import { createLogger, pseudonymize } from "@/lib/logger";

function capture(secret?: string) {
  const lines: Record<string, unknown>[] = [];
  const sink = (line: string) => lines.push(JSON.parse(line) as Record<string, unknown>);
  const log = createLogger({
    ...(secret ? { secret } : {}),
    sinks: { info: sink, warn: sink, error: sink },
  });
  return { lines, log };
}

describe("logger", () => {
  it("solo escribe campos de la lista blanca y seudonimiza los identificadores", () => {
    const { lines, log } = capture("secreto-de-prueba");
    const fields = {
      route: "/s/x/inicio",
      status: 200,
      userId: "user-1",
      spaceId: "space-1",
      email: "ana@ejemplo.es",
      amount: "1234.56",
    } as Record<string, unknown>;
    log.info("page.view", fields);
    expect(lines[0]).toEqual({
      level: "info",
      event: "page.view",
      route: "/s/x/inicio",
      status: 200,
      userRef: pseudonymize("user-1", "secreto-de-prueba"),
      spaceRef: pseudonymize("space-1", "secreto-de-prueba"),
    });
    expect(JSON.stringify(lines[0])).not.toContain("user-1");
  });

  it("sin secreto no registra referencias y rechaza eventos con texto libre", () => {
    const { lines, log } = capture();
    log.warn("Fallo de Ana al pagar 300 €", { userId: "user-1" });
    log.error("auth.sign_in_failed", { code: "invalid" });
    expect(lines).toEqual([
      { level: "warn", event: "invalid_event" },
      { level: "error", event: "auth.sign_in_failed", code: "invalid" },
    ]);
  });

  it("el seudónimo es estable y depende del secreto", () => {
    expect(pseudonymize("a", "s1")).toBe(pseudonymize("a", "s1"));
    expect(pseudonymize("a", "s1")).not.toBe(pseudonymize("a", "s2"));
    expect(pseudonymize("a", "s1")).toHaveLength(16);
  });
});

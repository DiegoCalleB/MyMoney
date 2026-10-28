import { describe, expect, it } from "vitest";
import { decideSession } from "@/lib/auth-state";

describe("decideSession", () => {
  it("con segundo factor ya verificado entra", () => {
    expect(decideSession("aal2", "aal2")).toBe("ready");
  });
  it("con factor activado pero sin verificar en esta sesión pide el código", () => {
    expect(decideSession("aal1", "aal2")).toBe("verify");
  });
  it("sin factores obliga a activar el segundo factor", () => {
    expect(decideSession("aal1", "aal1")).toBe("enroll");
    expect(decideSession(null, null)).toBe("enroll");
  });
});

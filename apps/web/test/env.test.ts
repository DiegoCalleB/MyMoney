import { describe, expect, it } from "vitest";
import { readPublicEnv } from "@/lib/env";

describe("readPublicEnv", () => {
  it("devuelve la URL y la clave publicable", () => {
    expect(
      readPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef",
      }),
    ).toEqual({ url: "https://x.supabase.co", publishableKey: "sb_publishable_0123456789abcdef" });
  });

  it("devuelve null si falta la configuración", () => {
    expect(readPublicEnv({})).toBeNull();
  });

  it("se niega a arrancar con la clave secreta en la web", () => {
    expect(() =>
      readPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_0123456789abcdef",
      }),
    ).toThrow(/clave secreta/);
  });
});

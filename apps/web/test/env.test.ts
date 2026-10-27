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

import { readAppOrigin } from "@/lib/env";

describe("readAppOrigin", () => {
  it("usa el origen local si no hay configuración", () => {
    expect(readAppOrigin({})).toBe("http://localhost:3000");
  });
  it("normaliza un origen válido", () => {
    expect(readAppOrigin({ APP_ORIGIN: "https://mymoney.example.com/" })).toBe(
      "https://mymoney.example.com",
    );
  });
  it("rechaza rutas, parámetros y otros protocolos", () => {
    expect(() => readAppOrigin({ APP_ORIGIN: "https://x.example.com/ruta" })).toThrow();
    expect(() => readAppOrigin({ APP_ORIGIN: "https://x.example.com/?a=1" })).toThrow();
    expect(() => readAppOrigin({ APP_ORIGIN: "ftp://x.example.com" })).toThrow();
  });
});

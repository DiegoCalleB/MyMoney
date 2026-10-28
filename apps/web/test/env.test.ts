import { describe, expect, it } from "vitest";
import { readPublicEnv } from "@/lib/env";

// Se construye en tiempo de ejecución para que los escáneres de secretos no lo confundan con una clave real.
const FAKE_SECRET = ["sb", "secret", "0123456789abcdef"].join("_");

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
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_SECRET,
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

import { describePublicEnv } from "@/lib/env";

describe("describePublicEnv", () => {
  it("no señala nada si la configuración es válida", () => {
    expect(
      describePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdef",
      }),
    ).toEqual([]);
  });

  it("nombra la variable que falla y por qué, sin valores", () => {
    expect(describePublicEnv({})).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL:missing",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:missing",
    ]);
    expect(
      describePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "no es una url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "corta",
      }),
    ).toEqual(["NEXT_PUBLIC_SUPABASE_URL:invalid", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:invalid"]);
    expect(
      describePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_SECRET,
      }),
    ).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:secret"]);
  });
});

describe("readAppOrigin en producción", () => {
  it("exige APP_ORIGIN: un origen por defecto enviaría los enlaces a localhost", () => {
    expect(() => readAppOrigin({ NODE_ENV: "production" })).toThrow(/APP_ORIGIN/);
    expect(readAppOrigin({ NODE_ENV: "production", APP_ORIGIN: "https://a.example.com" })).toBe(
      "https://a.example.com",
    );
  });
});

describe("espacios al pegar los valores", () => {
  it("se recortan en la configuración de Supabase y en APP_ORIGIN", () => {
    expect(
      readPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "  https://x.supabase.co \n",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_0123456789abcdef ",
      }),
    ).toEqual({ url: "https://x.supabase.co", publishableKey: "sb_publishable_0123456789abcdef" });
    expect(readAppOrigin({ APP_ORIGIN: " https://a.example.com " })).toBe("https://a.example.com");
    expect(
      describePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: " https://x.supabase.co ",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_0123456789abcdef ",
      }),
    ).toEqual([]);
  });

  it("sigue rechazando la clave secreta aunque venga con espacios", () => {
    expect(() =>
      readPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `  ${FAKE_SECRET}`,
      }),
    ).toThrow(/clave secreta/);
  });
});

describe("APP_ORIGIN pegado con errores típicos", () => {
  it("añade https:// si falta y quita las comillas", () => {
    expect(readAppOrigin({ APP_ORIGIN: "mymoney-production-f2aa.up.railway.app" })).toBe(
      "https://mymoney-production-f2aa.up.railway.app",
    );
    expect(readAppOrigin({ APP_ORIGIN: '"https://a.example.com/"' })).toBe("https://a.example.com");
    expect(readAppOrigin({ APP_ORIGIN: "'a.example.com'" })).toBe("https://a.example.com");
  });

  it("sigue rechazando rutas, parámetros y otros protocolos", () => {
    expect(() => readAppOrigin({ APP_ORIGIN: "a.example.com/registro" })).toThrow();
    expect(() => readAppOrigin({ APP_ORIGIN: "https://a.example.com/?x=1" })).toThrow();
    expect(() => readAppOrigin({ APP_ORIGIN: "ftp://a.example.com" })).toThrow();
    expect(() => readAppOrigin({ APP_ORIGIN: "https://" })).toThrow();
  });
});

import { readMfaRequired } from "@/lib/env";

describe("readMfaRequired", () => {
  it("es obligatorio por defecto", () => {
    expect(readMfaRequired({})).toBe(true);
    expect(readMfaRequired({ MFA_REQUIRED: "true" })).toBe(true);
    expect(readMfaRequired({ MFA_REQUIRED: "" })).toBe(true);
    expect(readMfaRequired({ MFA_REQUIRED: "cualquier cosa" })).toBe(true);
  });
  it("solo se desactiva con false, 0 o no, ignorando mayúsculas y espacios", () => {
    expect(readMfaRequired({ MFA_REQUIRED: "false" })).toBe(false);
    expect(readMfaRequired({ MFA_REQUIRED: " FALSE " })).toBe(false);
    expect(readMfaRequired({ MFA_REQUIRED: "0" })).toBe(false);
    expect(readMfaRequired({ MFA_REQUIRED: "No" })).toBe(false);
  });
});

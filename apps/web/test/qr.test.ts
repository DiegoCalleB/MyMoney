import { describe, expect, it } from "vitest";
import { safeOtpauthUri } from "@/lib/qr";

describe("safeOtpauthUri", () => {
  it("acepta solo enlaces otpauth de tipo totp", () => {
    const ok = "otpauth://totp/MyMoney:ana%40ejemplo.es?secret=ABC&issuer=Supabase";
    expect(safeOtpauthUri(ok)).toBe(ok);
    expect(safeOtpauthUri("javascript:alert(1)")).toBeNull();
    expect(safeOtpauthUri("https://ejemplo.es")).toBeNull();
    expect(safeOtpauthUri("otpauth://hotp/x?secret=A")).toBeNull();
    expect(safeOtpauthUri("otpauth://totp/x y")).toBeNull();
    expect(safeOtpauthUri("")).toBeNull();
  });
});

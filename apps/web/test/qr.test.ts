import { describe, expect, it } from "vitest";
import { qrToDataUrl, safeOtpauthUri } from "@/lib/qr";

describe("qrToDataUrl", () => {
  it("deja intacta una URL de datos", () => {
    expect(qrToDataUrl("data:image/svg+xml;utf-8,<svg/>")).toBe("data:image/svg+xml;utf-8,<svg/>");
  });
  it("convierte un SVG en URL de datos escapada", () => {
    expect(qrToDataUrl("<svg a='1'/>")).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg a='1'/>")}`,
    );
  });
});

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

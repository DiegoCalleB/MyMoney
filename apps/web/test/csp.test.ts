import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/csp";

describe("buildCsp", () => {
  it("en producción no permite eval ni inline y bloquea marcos", () => {
    const csp = buildCsp("abc", { dev: false, supabaseUrl: "https://x.supabase.co" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("en desarrollo añade unsafe-eval (lo exige React) y no fuerza https", () => {
    const csp = buildCsp("abc", { dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("createNonce", () => {
  it("genera 128 bits distintos en cada llamada", () => {
    const a = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });
});

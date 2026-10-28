import type { NextConfig } from "next";

/**
 * Cabeceras fijas de seguridad (plan §6). La CSP con nonce se genera por petición en
 * `src/proxy.ts`, porque cambia en cada respuesta.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Los paquetes del monorepo se publican como TypeScript fuente.
  transpilePackages: ["@mymoney/finance-core", "@mymoney/importers", "@mymoney/schemas"],
  // Un extracto pesa como máximo 5 MB (MAX_FILE_BYTES); el servidor lo vuelve a comprobar.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default nextConfig;

import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("app.tagline"),
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // En iPhone: se abre a pantalla completa al añadirla a la pantalla de inicio.
  appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
};

/**
 * Todas las páginas se renderizan por petición: la CSP lleva un nonce distinto en cada
 * respuesta y una página estática no podría incluirlo en sus scripts.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="es-ES">
      <body>
        <a className="skip-link" href="#contenido">
          {t("app.skip_to_content")}
        </a>
        {children}
      </body>
    </html>
  );
}

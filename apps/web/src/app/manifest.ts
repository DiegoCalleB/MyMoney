import type { MetadataRoute } from "next";
import { t } from "@/lib/i18n";

/**
 * Manifiesto para instalar la app en el móvil (PWA). Deliberadamente sin service worker ni
 * caché sin conexión: los datos financieros no deben quedar guardados en el dispositivo más
 * allá de la sesión (amenaza T3). Se abre a pantalla completa y entra por «Tus hogares», que
 * lleva a iniciar sesión si hace falta.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("app.tagline"),
    lang: "es-ES",
    start_url: "/hogares",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfaf8",
    theme_color: "#1f5f4a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

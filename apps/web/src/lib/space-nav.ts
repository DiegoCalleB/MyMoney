/**
 * Navegación del hogar: cinco secciones en la barra inferior y, dentro de las que agrupan varias
 * pantallas, un sub-menú. Es pura (sin React) para poder probarla: dice a qué sección pertenece
 * una ruta y cuál es la pantalla actual. Los textos viven en el catálogo.
 */
export const SECTION_IDS = ["home", "spend", "invest", "assistant", "more"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

interface Section {
  readonly id: SectionId;
  /** Pantalla a la que lleva el botón de la barra. */
  readonly landing: string;
  /** Primer tramo de la ruta (tras `/s/{id}/`) de las pantallas de la sección. */
  readonly segments: readonly string[];
}

export const SECTIONS: readonly Section[] = [
  { id: "home", landing: "inicio", segments: ["inicio"] },
  {
    id: "spend",
    landing: "gastos",
    segments: ["gastos", "revisar", "cobros", "movimientos", "importar"],
  },
  {
    id: "invest",
    landing: "rentabilidad",
    segments: ["rentabilidad", "exposicion", "referencia", "fiscal"],
  },
  { id: "assistant", landing: "asistente", segments: ["asistente"] },
  {
    id: "more",
    landing: "mas",
    segments: ["mas", "cuentas", "valores", "conexiones", "supuestos"],
  },
];

export interface SubItem {
  readonly key: string;
  /** Ruta bajo `/s/{id}/`. */
  readonly path: string;
}

/** Pantallas de las secciones que agrupan varias (las demás no llevan sub-menú). */
export const SUBNAV: Partial<Record<SectionId, readonly SubItem[]>> = {
  spend: [
    { key: "summary", path: "gastos" },
    { key: "review", path: "revisar" },
    { key: "income", path: "cobros" },
    { key: "add", path: "movimientos/nuevo" },
    { key: "import", path: "importar" },
  ],
  invest: [
    { key: "returns", path: "rentabilidad" },
    { key: "exposure", path: "exposicion" },
    { key: "benchmark", path: "referencia" },
    { key: "tax", path: "fiscal" },
  ],
};

/** Sección de una ruta del hogar; `null` si la ruta no es de este hogar o no se reconoce. */
export function sectionOf(pathname: string, spaceId: string): SectionId | null {
  const prefix = `/s/${spaceId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const first = pathname.slice(prefix.length).split("/")[0] ?? "";
  return SECTIONS.find((s) => s.segments.includes(first))?.id ?? null;
}

/** ¿Es `path` (bajo `/s/{id}/`) la pantalla actual o una de sus subpantallas? */
export function isCurrent(pathname: string, spaceId: string, path: string): boolean {
  const full = `/s/${spaceId}/${path}`;
  return pathname === full || pathname.startsWith(`${full}/`);
}

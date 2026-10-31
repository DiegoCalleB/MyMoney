import { describe, expect, it } from "vitest";
import { SECTIONS, SECTION_IDS, SUBNAV, isCurrent, sectionOf } from "@/lib/space-nav";

const id = "0ecffd10-756b-4ef2-a197-1773972b8e6b";
const at = (path: string) => `/s/${id}/${path}`;

describe("sectionOf", () => {
  it.each([
    ["inicio", "home"],
    ["gastos", "spend"],
    ["revisar", "spend"],
    ["cobros", "spend"],
    ["movimientos/nuevo", "spend"],
    ["importar/archivo", "spend"],
    ["rentabilidad", "invest"],
    ["exposicion/abc", "invest"],
    ["referencia", "invest"],
    ["fiscal", "invest"],
    ["asistente", "assistant"],
    ["mas", "more"],
    ["cuentas/nueva", "more"],
    ["valores", "more"],
    ["conexiones/banco", "more"],
    ["supuestos", "more"],
  ] as const)("%s → %s", (path, section) => {
    expect(sectionOf(at(path), id)).toBe(section);
  });

  it("no reconoce rutas de otro hogar ni pantallas desconocidas", () => {
    expect(sectionOf("/s/otro/inicio", id)).toBeNull();
    expect(sectionOf("/hogares", id)).toBeNull();
    expect(sectionOf(at("desconocida"), id)).toBeNull();
    expect(sectionOf(at(""), id)).toBeNull();
  });
});

describe("isCurrent", () => {
  it("coincide con la pantalla y sus subpantallas, no con otra que empiece igual", () => {
    expect(isCurrent(at("importar"), id, "importar")).toBe(true);
    expect(isCurrent(at("importar/archivo"), id, "importar")).toBe(true);
    expect(isCurrent(at("importarotra"), id, "importar")).toBe(false);
    expect(isCurrent(at("gastos"), id, "revisar")).toBe(false);
  });
});

describe("configuración", () => {
  it("hay una sección por identificador y su pantalla de entrada pertenece a ella", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([...SECTION_IDS]);
    for (const s of SECTIONS) expect(s.segments).toContain(s.landing);
  });

  it("todas las pantallas del sub-menú caen en su sección", () => {
    for (const [section, items] of Object.entries(SUBNAV)) {
      for (const item of items) expect(sectionOf(at(item.path), id)).toBe(section);
    }
  });

  it("ninguna pantalla pertenece a dos secciones", () => {
    const all = SECTIONS.flatMap((s) => s.segments);
    expect(new Set(all).size).toBe(all.length);
  });
});

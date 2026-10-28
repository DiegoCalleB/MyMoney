/**
 * Comprobación de salud para el hosting. No lee la base de datos ni la sesión y no devuelve
 * datos: solo dice que el proceso responde.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { readPublicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { bankReturn, connectionIdFromState } from "@/server/connections-model";
import { callConnectBank } from "@/server/edge";

/**
 * Vuelta del banco tras dar el permiso. El `state` ata la vuelta a la conexión y a la persona que la
 * empezó (se compara en la función con el valor cifrado en la bóveda); aquí solo se valida el
 * formato, se cierra la sesión con el banco y se lleva a vincular las cuentas.
 */
export async function GET(request: NextRequest) {
  const { supabase } = await requireReadyUser();
  const back = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  const parsed = bankReturn.safeParse({
    code: request.nextUrl.searchParams.get("code") ?? "",
    state: request.nextUrl.searchParams.get("state") ?? "",
  });
  if (!parsed.success) return back("/hogares?conexion=error");

  const connectionId = connectionIdFromState(parsed.data.state);
  const owner = await supabase
    .from("connections")
    .select("space_id")
    .eq("id", connectionId)
    .maybeSingle();
  const space = z.object({ space_id: z.uuid() }).safeParse(owner.data);
  if (!space.success) return back("/hogares?conexion=error");
  const spaceId = space.data.space_id;

  const env = readPublicEnv();
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!env || !token) return back(`/s/${spaceId}/conexiones?sync=error`);
  const finished = await callConnectBank(env, token, {
    action: "finish",
    connection_id: connectionId,
    state: parsed.data.state,
    code: parsed.data.code,
  });
  if (!finished.ok) {
    logger.warn("connection.finish_failed", { code: finished.error, spaceId });
    await supabase.rpc("revoke_connection", { p_connection_id: connectionId });
    return back(`/s/${spaceId}/conexiones?sync=error`);
  }
  return back(`/s/${spaceId}/conexiones/banco/${connectionId}`);
}

"use server";

import { connectionActionInput, finishBinanceInput, startBinanceInput } from "@mymoney/schemas";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrorsFrom, formText, type FormState } from "@/components/form-state";
import { calendarDateInZone } from "@/lib/dates";
import { readPublicEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requireReadyUser } from "@/server/auth";
import { edgeErrorCancels, edgeErrorKey } from "@/server/connections-model";
import { callConnectBinance } from "@/server/edge";
import { loadAccountOptions, loadSpace } from "@/server/queries/home";

/** Estado del asistente de Binance: la clave PÚBLICA es lo único que se enseña. */
export interface BinanceState extends FormState {
  readonly connectionId?: string;
  readonly publicKeyPem?: string;
  readonly fingerprint?: string;
  /** La conexión se canceló (p. ej., la clave tenía permisos de más): hay que empezar de nuevo. */
  readonly cancelled?: boolean;
}

/** Moneda en la que sincroniza el trabajador (SYNC_QUOTE de la función; EUR por defecto). */
const SYNC_CURRENCY = "EUR";
const SPOT_REF = "spot";

async function accessToken(
  supabase: Awaited<ReturnType<typeof requireReadyUser>>["supabase"],
): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Paso 1 de Binance: crea la conexión (pendiente) vinculada a una cuenta y pide al servidor que
 * genere el par de claves. Devuelve la clave pública para registrarla en Binance; la privada se
 * queda cifrada en la bóveda y no vuelve a salir.
 */
export async function startBinanceAction(
  _previous: BinanceState,
  formData: FormData,
): Promise<BinanceState> {
  const { supabase, userId } = await requireReadyUser();
  const parsed = startBinanceInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    accountId: formText(formData, "accountId"),
  });
  if (!parsed.success) return fieldErrorsFrom(parsed.error);
  const { spaceId, accountId } = parsed.data;

  const space = await loadSpace(supabase, spaceId);
  if (!space) return { error: "connections.error.failed" };
  const today = calendarDateInZone(new Date(), space.timezone);
  const account = (await loadAccountOptions(supabase, spaceId, today)).find(
    (a) => a.id === accountId,
  );
  if (!account || account.currency !== SYNC_CURRENCY) {
    return { fieldErrors: { accountId: "connections.account_invalid" } };
  }
  const env = readPublicEnv();
  const token = await accessToken(supabase);
  if (!env || !token) return { error: "connections.error.failed" };

  const created = await supabase
    .from("connections")
    .insert({ space_id: spaceId, kind: "api", provider: "binance", created_by: userId })
    .select("id")
    .single();
  const connectionId = z.object({ id: z.uuid() }).safeParse(created.data);
  if (created.error || !connectionId.success) {
    logger.warn("connection.create_failed", { code: created.error?.code ?? "unknown", spaceId });
    return { error: "connections.error.failed" };
  }
  const id = connectionId.data.id;

  const linked = await supabase.from("connection_accounts").insert({
    connection_id: id,
    space_id: spaceId,
    account_id: accountId,
    external_ref: SPOT_REF,
  });
  if (linked.error) {
    logger.warn("connection.link_failed", { code: linked.error.code, spaceId });
    await supabase.rpc("revoke_connection", { p_connection_id: id });
    return { error: "connections.error.failed" };
  }

  const started = await callConnectBinance(env, token, { action: "start", connection_id: id });
  if (!started.ok) {
    logger.warn("connection.start_failed", { code: started.error, spaceId });
    await supabase.rpc("revoke_connection", { p_connection_id: id });
    return { error: edgeErrorKey(started.error) };
  }
  const { publicKeyPem, fingerprint } = started.data;
  if (typeof publicKeyPem !== "string" || typeof fingerprint !== "string") {
    await supabase.rpc("revoke_connection", { p_connection_id: id });
    return { error: "connections.error.failed" };
  }
  return { connectionId: id, publicKeyPem, fingerprint };
}

/**
 * Paso 2 de Binance: la persona pega la clave de acceso (API key) que le dio Binance al registrar
 * la clave pública. El servidor comprueba que es de SOLO LECTURA; si puede operar o retirar, se
 * rechaza y la conexión se cancela. Esa clave no se guarda en la web ni se registra.
 */
export async function finishBinanceAction(
  _previous: BinanceState,
  formData: FormData,
): Promise<BinanceState> {
  const { supabase } = await requireReadyUser();
  const parsed = finishBinanceInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    connectionId: formText(formData, "connectionId"),
    apiKey: formText(formData, "apiKey"),
  });
  const connectionId = formText(formData, "connectionId");
  if (!parsed.success) {
    // Los errores no incluyen el valor escrito; se conserva el paso en el que está la persona.
    return { ...fieldErrorsFrom(parsed.error), connectionId };
  }
  const { spaceId, apiKey } = parsed.data;
  const env = readPublicEnv();
  const token = await accessToken(supabase);
  if (!env || !token) return { error: "connections.error.failed", connectionId };

  const finished = await callConnectBinance(env, token, {
    action: "finish",
    connection_id: parsed.data.connectionId,
    api_key: apiKey,
  });
  if (!finished.ok) {
    logger.warn("connection.finish_failed", { code: finished.error, spaceId });
    return {
      error: edgeErrorKey(finished.error),
      connectionId,
      ...(edgeErrorCancels(finished.error) ? { cancelled: true } : {}),
    };
  }
  // Primera sincronización: si falla o se limita, la diaria la recogerá.
  await supabase.rpc("request_sync", { p_connection_id: parsed.data.connectionId });
  redirect(`/s/${spaceId}/conexiones?sync=queued`);
}

/** Pide una sincronización ahora (máximo una cada 15 minutos por conexión). */
export async function syncNowAction(formData: FormData): Promise<void> {
  const { supabase } = await requireReadyUser();
  const parsed = connectionActionInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    connectionId: formText(formData, "connectionId"),
  });
  if (!parsed.success) redirect("/hogares");
  const { spaceId, connectionId } = parsed.data;
  const result = await supabase.rpc("request_sync", { p_connection_id: connectionId });
  const reason = z.object({ reason: z.string() }).safeParse(result.data);
  if (result.error)
    logger.warn("connection.sync_request_failed", { code: result.error.code, spaceId });
  redirect(
    `/s/${spaceId}/conexiones?sync=${result.error || !reason.success ? "error" : reason.data.reason}`,
  );
}

/** Revoca la conexión: borra su secreto y cancela lo pendiente. En Binance hay que borrar la clave aparte. */
export async function revokeConnectionAction(formData: FormData): Promise<void> {
  const { supabase } = await requireReadyUser();
  const parsed = connectionActionInput.safeParse({
    spaceId: formText(formData, "spaceId"),
    connectionId: formText(formData, "connectionId"),
  });
  if (!parsed.success) redirect("/hogares");
  const { spaceId, connectionId } = parsed.data;
  const result = await supabase.rpc("revoke_connection", { p_connection_id: connectionId });
  if (result.error) logger.warn("connection.revoke_failed", { code: result.error.code, spaceId });
  redirect(`/s/${spaceId}/conexiones`);
}

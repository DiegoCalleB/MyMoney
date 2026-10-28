import { describe, expect, it } from "vitest";
import { isMessageKey } from "@/lib/i18n";
import {
  bankAccount,
  bankList,
  bankReturn,
  connectionAttentionKey,
  connectionIdFromState,
  connectionRow,
  edgeErrorCancels,
  edgeErrorKey,
  syncNoticeKey,
  type ConnectionRow,
} from "@/server/connections-model";
import { callConnectBinance } from "@/server/edge";

const ID = "0b4c7f0e-5a52-4a6c-8b53-1f1f6f2a9c01";
const row = (status: ConnectionRow["status"]): ConnectionRow =>
  connectionRow.parse({
    id: ID,
    provider: "binance",
    status,
    last_success_at: null,
    last_error_code: null,
    consent_expires_at: null,
  });

describe("edgeErrorKey", () => {
  it.each([
    "key_not_readonly",
    "key_rejected",
    "invalid_api_key",
    "forbidden",
    "not_found",
    "not_pending",
    "no_key_pair",
    "secret_unreadable",
    "provider_unreachable",
    "algo_raro",
  ])("%s tiene texto", (code) => {
    expect(isMessageKey(edgeErrorKey(code))).toBe(true);
  });

  it("lo desconocido es un fallo genérico y solo una clave cancela la conexión", () => {
    expect(edgeErrorKey("algo_raro")).toBe("connections.error.failed");
    expect(edgeErrorCancels("key_not_readonly")).toBe(true);
    expect(edgeErrorCancels("key_rejected")).toBe(false);
  });
});

describe("avisos de la lista", () => {
  it("cada resultado de sincronizar y cada estado tiene texto", () => {
    for (const reason of ["queued", "too_soon", "already_queued", "error"]) {
      expect(isMessageKey(syncNoticeKey(reason) ?? "")).toBe(true);
    }
    expect(syncNoticeKey("otro")).toBeNull();
    expect(syncNoticeKey(undefined)).toBeNull();
    for (const status of ["needs_attention", "expired", "pending"] as const) {
      expect(isMessageKey(connectionAttentionKey(row(status)) ?? "")).toBe(true);
    }
    expect(connectionAttentionKey(row("active"))).toBeNull();
    expect(connectionAttentionKey(row("revoked"))).toBeNull();
  });
});

describe("callConnectBinance", () => {
  const env = {
    url: "https://p.example.test",
    publishableKey: "sb_publishable_de_prueba_1234567890",
  };
  const body = { action: "finish", connection_id: ID, api_key: "A".repeat(64) } as const;
  const json = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  it("envía el JWT de la persona y la clave publicable, nunca otra cosa", async () => {
    let seen: { url: string; init?: RequestInit } | undefined;
    const result = await callConnectBinance(env, "jwt-de-prueba", body, (url, init) => {
      seen = { url, ...(init ? { init } : {}) };
      return Promise.resolve(json(200, { ok: true, ipRestricted: true }));
    });
    expect(result).toEqual({ ok: true, data: { ok: true, ipRestricted: true } });
    expect(seen?.url).toBe("https://p.example.test/functions/v1/connect-binance");
    expect(seen?.init?.headers).toEqual({
      authorization: "Bearer jwt-de-prueba",
      apikey: env.publishableKey,
      "content-type": "application/json",
    });
    expect(seen?.init?.cache).toBe("no-store");
  });

  it("devuelve solo el código del error, no el cuerpo", async () => {
    const r = await callConnectBinance(env, "j", body, () =>
      Promise.resolve(json(422, { error: "key_not_readonly", violations: ["enableWithdrawals"] })),
    );
    expect(r).toEqual({ ok: false, status: 422, error: "key_not_readonly" });
    expect(JSON.stringify(r)).not.toContain("enableWithdrawals");
  });

  it("tolera respuestas sin JSON, listas, errores de red y errores sin código", async () => {
    const html = await callConnectBinance(env, "j", body, () =>
      Promise.resolve(new Response("<html>", { status: 502 })),
    );
    expect(html).toEqual({ ok: false, status: 502, error: "unknown" });
    const list = await callConnectBinance(env, "j", body, () => Promise.resolve(json(200, [1, 2])));
    expect(list).toEqual({ ok: true, data: {} });
    const down = await callConnectBinance(env, "j", body, () =>
      Promise.reject(new Error("sin red")),
    );
    expect(down).toEqual({ ok: false, status: 0, error: "provider_unreachable" });
    const noCode = await callConnectBinance(env, "j", body, () =>
      Promise.resolve(json(400, { error: 5 })),
    );
    expect(noCode).toEqual({ ok: false, status: 400, error: "unknown" });
  });
});

describe("vuelta del banco", () => {
  const state = `${ID}.${"a".repeat(32)}`;

  it("acepta un code y un state con el formato esperado y saca la conexión del state", () => {
    const parsed = bankReturn.parse({ code: "abc-DEF_1.2~3", state });
    expect(connectionIdFromState(parsed.state)).toBe(ID);
  });

  it.each([
    { code: "", state },
    { code: "con espacios", state },
    { code: "x".repeat(513), state },
    { code: "ok", state: "basura" },
    { code: "ok", state: `${ID}.${"A".repeat(32)}` },
    { code: "ok", state: `${ID}.${"a".repeat(31)}` },
  ])("rechaza %j", (input) => {
    expect(bankReturn.safeParse(input).success).toBe(false);
  });

  it("valida la lista de bancos y las cuentas ofrecidas", () => {
    expect(bankList.safeParse({ banks: [{ name: "Banco Ficticio", country: "ES" }] }).success).toBe(
      true,
    );
    expect(bankList.safeParse({ banks: [{ name: "", country: "ES" }] }).success).toBe(false);
    expect(bankAccount.safeParse({ uid: "u1", hint: "••••1332", currency: "EUR" }).success).toBe(
      true,
    );
    expect(bankAccount.safeParse({ uid: "", hint: "", currency: "EUR" }).success).toBe(false);
  });

  it.each(["provider_failed", "state_mismatch", "state_expired", "no_session"])(
    "traduce el error %s a un texto del catálogo",
    (code) => {
      expect(isMessageKey(edgeErrorKey(code))).toBe(true);
      expect(edgeErrorKey(code)).not.toBe("connections.error.failed");
    },
  );
});

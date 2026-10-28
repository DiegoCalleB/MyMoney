import { describe, expect, it } from "vitest";
import { json, serviceRpc, userRpc } from "../_shared/rpc.ts";
import { readBundle } from "../_shared/secret-bundle.ts";
import { seal } from "../_shared/vault.ts";
import { toBytea, utf8 } from "../_shared/bytes.ts";
import { CONNECTION_ID, SERVICE_KEY, SPACE_ID, fakeFetch, reply, testKeks } from "./fakes.ts";

const config = { supabaseUrl: "https://proyecto.example.test", serviceKey: SERVICE_KEY };

describe("serviceRpc / userRpc", () => {
  it("el servidor usa su clave y la persona su JWT", async () => {
    const t = fakeFetch({ "rpc:una": () => reply(200, { ok: true }) });
    const a = await serviceRpc<{ ok: boolean }>(config, t.fetchFn, "una", { x: 1 });
    expect(a).toEqual({ ok: true, status: 200, data: { ok: true } });
    expect(t.calls[0]?.headers.authorization).toBe(`Bearer ${SERVICE_KEY}`);
    await userRpc({ ...config, publishableKey: "pub" }, t.fetchFn, "jwt", "una", {});
    expect(t.calls[1]?.headers).toMatchObject({ apikey: "pub", authorization: "Bearer jwt" });
    expect(t.calls[1]?.headers.authorization).not.toContain(SERVICE_KEY);
  });

  it("una respuesta que no es JSON da data nulo sin romper", async () => {
    const t = fakeFetch({ "rpc:rota": () => new Response("<html>", { status: 502 }) });
    expect(await serviceRpc(config, t.fetchFn, "rota", {})).toEqual({ ok: false, status: 502, data: null });
    expect(await userRpc({ ...config, publishableKey: "p" }, t.fetchFn, "j", "rota", {})).toEqual({
      ok: false,
      status: 502,
      data: null,
    });
  });

  it("json() no se cachea", () => {
    expect(json(201, { a: 1 }).headers.get("cache-control")).toBe("no-store");
  });
});

describe("readBundle", () => {
  it.each(["[1,2]", "null", '"texto"'])("un secreto que no es un objeto (%s) se trata como ausente", async (plain) => {
    const keks = await testKeks();
    const scope = { spaceId: SPACE_ID, connectionId: CONNECTION_ID };
    const sealed = await seal(utf8(plain), scope, keks.current);
    const t = fakeFetch({
      "rpc:get_connection_secret": () =>
        reply(200, [
          {
            space_id: SPACE_ID,
            ciphertext: toBytea(sealed.ciphertext),
            nonce: toBytea(sealed.nonce),
            wrapped_dek: toBytea(sealed.wrappedDek),
            wrap_nonce: toBytea(sealed.wrapNonce),
            kek_version: sealed.kekVersion,
            provider: "binance",
          },
        ]),
    });
    expect(await readBundle(config, t.fetchFn, CONNECTION_ID, keks.byVersion)).toBeNull();
  });

  it("una respuesta de error de la base de datos se trata como ausente", async () => {
    const keks = await testKeks();
    const t = fakeFetch({ "rpc:get_connection_secret": () => reply(500, null) });
    expect(await readBundle(config, t.fetchFn, CONNECTION_ID, keks.byVersion)).toBeNull();
  });
});

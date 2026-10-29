import { describe, expect, it } from "vitest";
import {
  fromBase64,
  fromBytea,
  fromHex,
  text,
  toBase64,
  toBytea,
  toHex,
  utf8,
  wipe,
} from "../_shared/bytes.ts";
import { importKek, loadKeks, open, rewrap, seal, type Kek } from "../_shared/vault.ts";

const keyB64 = (fill: number) => toBase64(new Uint8Array(32).fill(fill));
const scope = { spaceId: "space-1", connectionId: "conn-1" };

describe("bytes", () => {
  it("convierte hexadecimal, bytea y base64 en ambos sentidos", () => {
    const bytes = Uint8Array.from([0, 1, 254, 255]);
    expect(toHex(bytes)).toBe("0001feff");
    expect(fromHex("0001FEFF")).toEqual(bytes);
    expect(toBytea(bytes)).toBe("\\x0001feff");
    expect(fromBytea("\\x0001feff")).toEqual(bytes);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(fromHex("")).toEqual(new Uint8Array());
    expect(text(utf8("año"))).toBe("año");
  });

  it("rechaza entradas mal formadas", () => {
    expect(() => fromHex("0g")).toThrow(RangeError);
    expect(() => fromHex("abc")).toThrow(RangeError);
    expect(() => fromBytea("0001")).toThrow(RangeError);
  });

  it("wipe pone a cero", () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    wipe(bytes);
    expect(bytes).toEqual(new Uint8Array(3));
  });
});

describe("importKek / loadKeks", () => {
  it("importa una clave de 32 bytes y rechaza otros tamaños y versiones", async () => {
    expect((await importKek(keyB64(1), 3)).version).toBe(3);
    await expect(importKek(toBase64(new Uint8Array(16)), 1)).rejects.toThrow("32 bytes");
    await expect(importKek(keyB64(1), 0)).rejects.toThrow("Versión");
    await expect(importKek(keyB64(1), 1.5)).rejects.toThrow("Versión");
  });

  it("carga las versiones definidas y exige la actual", async () => {
    const env = (name: string) =>
      ({ VAULT_KEK_V1: keyB64(1), VAULT_KEK_V2: keyB64(2), VAULT_KEK_CURRENT: "2" })[name];
    const keks = await loadKeks(env);
    expect(keks.current.version).toBe(2);
    expect([...keks.byVersion.keys()]).toEqual([1, 2]);
    await expect(loadKeks(() => undefined)).rejects.toThrow("versión actual");
    await expect(loadKeks((n) => ({ VAULT_KEK_V1: keyB64(1), VAULT_KEK_CURRENT: "2" })[n])).rejects.toThrow(
      "versión actual",
    );
  });
});

describe("seal / open", () => {
  const setup = async () => {
    const kek = await importKek(keyB64(7), 1);
    return { kek, keks: new Map<number, Kek>([[1, kek]]) };
  };

  it("cifra y descifra; el texto cifrado no contiene el original", async () => {
    const { kek, keks } = await setup();
    const secret = utf8('{"apiKey":"clave-de-prueba"}');
    const sealed = await seal(secret, scope, kek);
    expect(sealed.nonce).toHaveLength(12);
    expect(sealed.wrapNonce).toHaveLength(12);
    expect(sealed.kekVersion).toBe(1);
    expect(toHex(sealed.ciphertext)).not.toContain(toHex(secret));
    expect(text(await open(sealed, scope, keks))).toBe('{"apiKey":"clave-de-prueba"}');
  });

  it("dos cifrados del mismo secreto dan resultados distintos (nonce y DEK aleatorios)", async () => {
    const { kek } = await setup();
    const a = await seal(utf8("x"), scope, kek);
    const b = await seal(utf8("x"), scope, kek);
    expect(toHex(a.ciphertext)).not.toBe(toHex(b.ciphertext));
    expect(toHex(a.wrappedDek)).not.toBe(toHex(b.wrappedDek));
  });

  it("no descifra en otra conexión ni en otro espacio (la AAD liga la fila)", async () => {
    const { kek, keks } = await setup();
    const sealed = await seal(utf8("secreto"), scope, kek);
    await expect(open(sealed, { ...scope, connectionId: "conn-2" }, keks)).rejects.toThrow(
      "No se pudo descifrar",
    );
    await expect(open(sealed, { ...scope, spaceId: "space-2" }, keks)).rejects.toThrow(
      "No se pudo descifrar",
    );
  });

  it("detecta texto cifrado o clave de sobre alterados", async () => {
    const { kek, keks } = await setup();
    const sealed = await seal(utf8("secreto"), scope, kek);
    const flip = (bytes: Uint8Array) => Uint8Array.from(bytes, (b, i) => (i === 0 ? b ^ 1 : b));
    await expect(open({ ...sealed, ciphertext: flip(sealed.ciphertext) }, scope, keks)).rejects.toThrow();
    await expect(open({ ...sealed, wrappedDek: flip(sealed.wrappedDek) }, scope, keks)).rejects.toThrow();
    await expect(open({ ...sealed, nonce: flip(sealed.nonce) }, scope, keks)).rejects.toThrow();
  });

  it("no descifra con otra clave maestra ni con una versión desconocida", async () => {
    const { kek } = await setup();
    const sealed = await seal(utf8("secreto"), scope, kek);
    const other = await importKek(keyB64(9), 1);
    await expect(open(sealed, scope, new Map([[1, other]]))).rejects.toThrow("No se pudo descifrar");
    await expect(open(sealed, scope, new Map())).rejects.toThrow("desconocida");
  });

  it("rewrap pasa a la KEK actual sin cambiar el contenido", async () => {
    const old = await importKek(keyB64(1), 1);
    const next = await importKek(keyB64(2), 2);
    const keks = new Map<number, Kek>([
      [1, old],
      [2, next],
    ]);
    const sealed = await seal(utf8("secreto"), scope, old);
    const rotated = await rewrap(sealed, scope, keks, next);
    expect(rotated.kekVersion).toBe(2);
    expect(text(await open(rotated, scope, keks))).toBe("secreto");
    // La versión anterior ya no hace falta para abrirlo.
    expect(text(await open(rotated, scope, new Map([[2, next]])))).toBe("secreto");
  });
});

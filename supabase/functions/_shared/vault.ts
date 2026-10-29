// Bóveda de credenciales: cifrado de sobre con AES-256-GCM (WebCrypto, sin dependencias).
//
//  · Cada secreto se cifra con una clave de datos (DEK) aleatoria de 256 bits.
//  · La DEK se guarda cifrada con la clave maestra (KEK), que vive fuera de la base de datos
//    (secreto de la Edge Function; después, un KMS de la UE) y tiene versión para poder rotarla.
//  · La AAD (datos asociados) liga el texto cifrado a su espacio, su conexión y la versión de la
//    KEK: copiar un texto cifrado a otra fila no sirve, porque no descifra.
// En la base de datos solo hay texto cifrado: una copia de la base no basta para usar nada.
import { fromBase64, utf8, wipe, type Bytes } from "./bytes.ts";

/** El secreto no se puede abrir: alterado, de otra fila o con otra clave maestra. Sin detalle. */
export class VaultError extends Error {}

export interface SealedSecret {
  readonly ciphertext: Bytes;
  readonly nonce: Bytes;
  readonly wrappedDek: Bytes;
  readonly wrapNonce: Bytes;
  readonly kekVersion: number;
}

/** A qué fila pertenece el secreto: forma parte de la AAD. */
export interface SecretScope {
  readonly spaceId: string;
  readonly connectionId: string;
}

export interface Kek {
  readonly version: number;
  readonly key: CryptoKey;
}

const NONCE_BYTES = 12;
const KEY_BYTES = 32;

function aad(scope: SecretScope, kekVersion: number): Bytes {
  return utf8(`${scope.spaceId}|${scope.connectionId}|${String(kekVersion)}`);
}

function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function aesKey(raw: Bytes, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usages);
}

/** Importa una KEK de 32 bytes codificada en base64. */
export async function importKek(base64: string, version: number): Promise<Kek> {
  if (!Number.isInteger(version) || version < 1 || version > 32767) {
    throw new RangeError("Versión de clave no válida");
  }
  const raw = fromBase64(base64.trim());
  if (raw.length !== KEY_BYTES) throw new RangeError("La clave maestra debe tener 32 bytes");
  try {
    return { version, key: await aesKey(raw, ["encrypt", "decrypt"]) };
  } finally {
    wipe(raw);
  }
}

/**
 * Carga las KEK de las variables de entorno: `VAULT_KEK_V<n>` (base64) y `VAULT_KEK_CURRENT`
 * (versión con la que se cifra). Las anteriores siguen sirviendo para descifrar hasta rotarlas.
 */
export async function loadKeks(env: (name: string) => string | undefined): Promise<{
  current: Kek;
  byVersion: ReadonlyMap<number, Kek>;
}> {
  const currentVersion = Number(env("VAULT_KEK_CURRENT") ?? "");
  const byVersion = new Map<number, Kek>();
  for (let v = 1; v <= 16; v++) {
    const value = env(`VAULT_KEK_V${String(v)}`);
    if (value) byVersion.set(v, await importKek(value, v));
  }
  const current = byVersion.get(currentVersion);
  if (!current) throw new Error("Falta la clave maestra de la versión actual");
  return { current, byVersion };
}

export async function seal(
  plaintext: Bytes,
  scope: SecretScope,
  kek: Kek,
): Promise<SealedSecret> {
  const dek = randomBytes(KEY_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const wrapNonce = randomBytes(NONCE_BYTES);
  const additionalData = aad(scope, kek.version);
  try {
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: nonce, additionalData },
        await aesKey(dek, ["encrypt"]),
        plaintext,
      ),
    );
    const wrappedDek = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapNonce, additionalData }, kek.key, dek),
    );
    return { ciphertext, nonce, wrappedDek, wrapNonce, kekVersion: kek.version };
  } finally {
    wipe(dek);
  }
}

/** Falla (sin detalle) si el texto cifrado se alteró, no es de esa fila o la KEK no corresponde. */
export async function open(
  sealed: SealedSecret,
  scope: SecretScope,
  keks: ReadonlyMap<number, Kek>,
): Promise<Bytes> {
  const kek = keks.get(sealed.kekVersion);
  if (!kek) throw new VaultError("Clave maestra desconocida");
  const additionalData = aad(scope, sealed.kekVersion);
  let dek: Bytes | null = null;
  try {
    dek = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: sealed.wrapNonce, additionalData },
        kek.key,
        sealed.wrappedDek,
      ),
    );
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: sealed.nonce, additionalData },
        await aesKey(dek, ["decrypt"]),
        sealed.ciphertext,
      ),
    );
  } catch {
    throw new VaultError("No se pudo descifrar el secreto");
  } finally {
    if (dek) wipe(dek);
  }
}

/** Vuelve a cifrar con la KEK actual (rotación) sin exponer el secreto fuera de esta función. */
export async function rewrap(
  sealed: SealedSecret,
  scope: SecretScope,
  keks: ReadonlyMap<number, Kek>,
  current: Kek,
): Promise<SealedSecret> {
  const plaintext = await open(sealed, scope, keks);
  try {
    return await seal(plaintext, scope, current);
  } finally {
    wipe(plaintext);
  }
}

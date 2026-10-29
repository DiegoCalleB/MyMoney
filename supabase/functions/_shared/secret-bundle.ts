// El secreto de una conexión es un JSON con sus credenciales, cifrado en la bóveda.
import { fromBytea, text, toBytea, utf8, type Bytes } from "./bytes.ts";
import { type Fetch, type RpcConfig, serviceRpc } from "./rpc.ts";
import { open, seal, type Kek, type SealedSecret, type SecretScope } from "./vault.ts";

export interface SecretRow {
  readonly space_id: string;
  readonly ciphertext: string;
  readonly nonce: string;
  readonly wrapped_dek: string;
  readonly wrap_nonce: string;
  readonly kek_version: number;
  readonly provider: string;
}

export function sealedFromRow(row: SecretRow): SealedSecret {
  return {
    ciphertext: fromBytea(row.ciphertext),
    nonce: fromBytea(row.nonce),
    wrappedDek: fromBytea(row.wrapped_dek),
    wrapNonce: fromBytea(row.wrap_nonce),
    kekVersion: row.kek_version,
  };
}

/** Lee y descifra el secreto de una conexión; `null` si no hay (revocada o sin credenciales). */
export async function readBundle(
  config: RpcConfig,
  fetchFn: Fetch,
  connectionId: string,
  keks: ReadonlyMap<number, Kek>,
): Promise<{ bundle: Record<string, unknown>; spaceId: string; provider: string } | null> {
  const result = await serviceRpc<SecretRow[]>(config, fetchFn, "get_connection_secret", {
    p_connection_id: connectionId,
  });
  const row = result.data?.[0];
  if (!result.ok || !row) return null;
  const scope: SecretScope = { spaceId: row.space_id, connectionId };
  const plaintext = await open(sealedFromRow(row), scope, keks);
  try {
    const bundle: unknown = JSON.parse(text(plaintext));
    if (typeof bundle !== "object" || bundle === null || Array.isArray(bundle)) return null;
    return { bundle: bundle as Record<string, unknown>, spaceId: row.space_id, provider: row.provider };
  } finally {
    plaintext.fill(0);
  }
}

/** Cifra y guarda el secreto (sustituye al anterior). Devuelve si la base de datos lo aceptó. */
export async function writeBundle(
  config: RpcConfig,
  fetchFn: Fetch,
  scope: SecretScope,
  bundle: Readonly<Record<string, unknown>>,
  kek: Kek,
  publicHint: string | null,
): Promise<boolean> {
  const plaintext: Bytes = utf8(JSON.stringify(bundle));
  try {
    const sealed = await seal(plaintext, scope, kek);
    const result = await serviceRpc<unknown>(config, fetchFn, "put_connection_secret", {
      p_connection_id: scope.connectionId,
      p_ciphertext: toBytea(sealed.ciphertext),
      p_nonce: toBytea(sealed.nonce),
      p_wrapped_dek: toBytea(sealed.wrappedDek),
      p_wrap_nonce: toBytea(sealed.wrapNonce),
      p_kek_version: sealed.kekVersion,
      p_public_hint: publicHint,
    });
    return result.ok;
  } finally {
    plaintext.fill(0);
  }
}

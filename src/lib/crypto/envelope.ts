import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env';

/**
 * docs/12-security.md §2.2 — envelope encryption.
 *
 *   APP_MASTER_KEY (KEK, 32 bytes)
 *     └─ wraps a DEK, unique per secret, 32 bytes CSPRNG
 *          └─ encrypts the value with AES-256-GCM
 *               └─ AAD = `${scope}:${key}:${keyVersion}`
 *
 * The AAD binds the ciphertext to its place: a row copied from another tenant
 * simply fails to decrypt.
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
/**
 * The full GCM tag. Passed to createDecipheriv explicitly: without it Node
 * accepts tags of 4, 8, 12, 13, 14, 15 or 16 bytes, so a truncated tag would
 * verify against a correspondingly weaker check. Short GCM tags are forgeable
 * with far less work than the full 128 bits implies, and the attacker chooses
 * the length here because it comes from the stored value.
 */
const TAG_BYTES = 16;

/**
 * Prisma's Bytes columns are written as Uint8Array backed by a plain
 * ArrayBuffer; values read back are ordinary Uint8Arrays. The two aliases keep
 * that asymmetry explicit instead of casting at every call site.
 */
export type WritableBytes = Uint8Array<ArrayBuffer>;

export type SealedValue = {
  ciphertext: WritableBytes;
  iv: WritableBytes;
  authTag: WritableBytes;
  wrappedKey: WritableBytes;
  keyVersion: number;
};

export type SealedInput = {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  wrappedKey: Uint8Array;
  keyVersion: number;
};

const bytes = (source: Buffer): WritableBytes => new Uint8Array(source);
const buf = (value: Uint8Array): Buffer => Buffer.from(value.buffer, value.byteOffset, value.byteLength);

/** One interface for the KEK, so KMS/Vault can replace the file without touching callers. */
export function getMasterKey(): Buffer {
  return Buffer.from(env().APP_MASTER_KEY, 'base64');
}

export function getPreviousMasterKey(): Buffer | null {
  const previous = env().APP_MASTER_KEY_PREVIOUS;
  return previous ? Buffer.from(previous, 'base64') : null;
}

function wrapDek(dek: Buffer, kek: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, kek, iv);
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  // iv | authTag | ciphertext
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function unwrapDek(wrapped: Buffer, kek: Buffer): Buffer {
  const iv = wrapped.subarray(0, IV_BYTES);
  const tag = wrapped.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = wrapped.subarray(IV_BYTES + TAG_BYTES);
  if (tag.length !== TAG_BYTES) throw new Error('wrapped key has a truncated authentication tag');
  const decipher = createDecipheriv(ALGO, kek, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function buildAad(scope: string | null, key: string, keyVersion: number): Buffer {
  return Buffer.from(`${scope ?? 'platform'}:${key}:${keyVersion}`, 'utf8');
}

export function seal(plaintext: string, aad: Buffer, keyVersion = 1): SealedValue {
  const dek = randomBytes(32);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, dek, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const sealed: SealedValue = {
    ciphertext: bytes(ciphertext),
    iv: bytes(iv),
    authTag: bytes(cipher.getAuthTag()),
    wrappedKey: bytes(wrapDek(dek, getMasterKey())),
    keyVersion,
  };
  dek.fill(0);
  return sealed;
}

export function open(sealed: SealedInput, aad: Buffer): string {
  const keys = [getMasterKey(), getPreviousMasterKey()].filter((k): k is Buffer => k !== null);
  let lastError: unknown;
  for (const kek of keys) {
    let dek: Buffer | null = null;
    try {
      dek = unwrapDek(buf(sealed.wrappedKey), kek);
      const tag = buf(sealed.authTag);
      if (tag.length !== TAG_BYTES) throw new Error('sealed value has a truncated authentication tag');
      const decipher = createDecipheriv(ALGO, dek, buf(sealed.iv), { authTagLength: TAG_BYTES });
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const out = Buffer.concat([decipher.update(buf(sealed.ciphertext)), decipher.final()]);
      const value = out.toString('utf8');
      out.fill(0);
      return value;
    } catch (error) {
      lastError = error;
    } finally {
      dek?.fill(0);
    }
  }
  throw new Error('Unable to decrypt value', { cause: lastError });
}

/** Re-wrap a DEK under a new KEK without ever touching the plaintext value. */
export function rewrap(wrappedKey: Uint8Array, fromKek: Buffer, toKek: Buffer): WritableBytes {
  const dek = unwrapDek(buf(wrappedKey), fromKek);
  try {
    return bytes(wrapDek(dek, toKek));
  } finally {
    dek.fill(0);
  }
}

import { createHash, createHmac, randomBytes, timingSafeEqual as nodeTimingSafeEqual, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '../env';

const scrypt = promisify(nodeScrypt) as (p: string | Buffer, s: string | Buffer, k: number) => Promise<Buffer>;

/** 32 bytes CSPRNG, base64url — the shape of every opaque token we issue. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Numeric OTP with uniform distribution (no modulo bias). */
export function randomNumericCode(digits = 6): string {
  const max = 10 ** digits;
  const limit = Math.floor(0xffffffff / max) * max;
  let value: number;
  do {
    value = randomBytes(4).readUInt32BE(0);
  } while (value >= limit);
  return String(value % max).padStart(digits, '0');
}

/** Base32 (Crockford-ish, no ambiguous characters) for offline check-in codes. */
const BASE32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export function randomBase32Code(length = 6): string {
  const buf = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += BASE32[(buf[i] ?? 0) % BASE32.length];
  return out;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Keyed digest for pseudonymous identifiers (IP, email, analytics subject). */
export function hmac(value: string, pepper?: string): string {
  return createHmac('sha256', pepper ?? env().AUTH_SECRET).update(value).digest('hex');
}

/** Constant-time comparison that also tolerates length mismatch. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing does not leak the length.
    nodeTimingSafeEqual(bufA, bufA);
    return false;
  }
  return nodeTimingSafeEqual(bufA, bufB);
}

/**
 * Recovery codes are hashed with a memory-hard KDF. argon2id when the native
 * binding is available, scrypt otherwise — both are salted and slow enough that
 * a leaked table is not a list of valid codes.
 */
type Argon2Module = {
  hash(value: string): Promise<string>;
  verify(hash: string, value: string): Promise<boolean>;
};

let argon2: Argon2Module | null | undefined;

async function loadArgon2(): Promise<Argon2Module | null> {
  if (argon2 !== undefined) return argon2;
  try {
    const mod = (await import('@node-rs/argon2')) as unknown as Argon2Module;
    argon2 = typeof mod.hash === 'function' ? mod : null;
  } catch {
    argon2 = null;
  }
  return argon2;
}

export async function hashSecretValue(value: string): Promise<string> {
  const a2 = await loadArgon2();
  if (a2) return a2.hash(value);
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifySecretValue(hash: string, value: string): Promise<boolean> {
  if (hash.startsWith('scrypt$')) {
    const [, saltB64, digestB64] = hash.split('$');
    if (!saltB64 || !digestB64) return false;
    const derived = await scrypt(value, Buffer.from(saltB64, 'base64url'), 32);
    return timingSafeEqual(derived.toString('base64url'), digestB64);
  }
  const a2 = await loadArgon2();
  if (!a2) return false;
  try {
    return await a2.verify(hash, value);
  } catch {
    return false;
  }
}

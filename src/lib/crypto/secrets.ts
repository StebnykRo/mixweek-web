import { withSystemScope } from '../db/tenant-client';
import { buildAad, open, seal } from './envelope';

/**
 * docs/12-security.md §2.2 — the only sanctioned way to read an integration
 * secret at runtime. There is deliberately no function that returns a stored
 * value to the UI or the API: the admin sees a hint, a rotation date and an
 * author, and nothing else.
 */

/** The closed registry of expected keys. Arbitrary strings are not accepted. */
export const SECRET_KEYS = [
  'mail.smtp_password',
  'mail.resend_api_key',
  'google.client_id',
  'google.client_secret',
  'push.vapid_public',
  'push.vapid_private',
  's3.access_key_id',
  's3.secret_access_key',
  'maps.api_key',
  'sentry.dsn',
  'analytics.pepper',
  'checkin.signing_key',
  'pickup.signing_key',
] as const;

const DYNAMIC_KEY = /^(webhook\.[a-z0-9-]{1,32}\.secret|integration\.[a-z0-9-]{1,32}\.token)$/;

export type SecretKey = (typeof SECRET_KEYS)[number] | (string & { __brand?: 'SecretKey' });

export function isSecretKey(key: string): boolean {
  return (SECRET_KEYS as readonly string[]).includes(key) || DYNAMIC_KEY.test(key);
}

export type SecretScope = { tenantId?: string | null };

type CacheEntry = { value: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(tenantId: string | null, key: string): string {
  return `${tenantId ?? 'platform'}:${key}`;
}

export function clearSecretCache(): void {
  cache.clear();
}

function hintOf(plaintext: string): string {
  return `••••${plaintext.slice(-4)}`;
}

export async function setSecret(
  scope: SecretScope,
  key: SecretKey,
  plaintext: string,
  actor: { userId?: string | null },
  options?: { expiresAt?: Date | null },
): Promise<void> {
  if (!isSecretKey(key)) throw new Error(`Unknown secret key: ${key}`);
  const tenantId = scope.tenantId ?? null;

  // Secrets are a configuration table that deliberately holds platform-level
  // rows (tenantId = null), so they are managed in the system scope
  // (docs/02 §4.2). Every read and write is keyed by (tenantId, key).
  const existing = await withSystemScope('read secret version', (db) =>
    db.secretSetting.findFirst({ where: { tenantId, key }, select: { keyVersion: true } }),
  );
  const keyVersion = (existing?.keyVersion ?? 0) + 1;
  const sealed = seal(plaintext, buildAad(tenantId, key, keyVersion), keyVersion);

  // The compound unique includes a nullable tenantId — Prisma's upsert input
  // cannot express that — so the existing row is looked up first.
  await withSystemScope('write secret', async (db) => {
    const payload = {
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
      wrappedKey: sealed.wrappedKey,
      keyVersion,
      hint: hintOf(plaintext),
      expiresAt: options?.expiresAt ?? null,
    };

    const row = await db.secretSetting.findFirst({ where: { tenantId, key }, select: { id: true } });
    if (row) {
      await db.secretSetting.update({ where: { id: row.id }, data: { ...payload, rotatedAt: new Date() } });
      return;
    }
    await db.secretSetting.create({
      data: { ...payload, tenantId, key, createdBy: actor.userId ?? null },
    });
  });

  cache.delete(cacheKey(tenantId, key));
}

/**
 * Reads a secret. Falls back from tenant scope to platform scope, so a tenant
 * that has not configured its own SMTP still sends through the platform's.
 */
export async function getSecret(key: SecretKey, scope: SecretScope = {}): Promise<string | null> {
  const tenantId = scope.tenantId ?? null;
  const scopes: (string | null)[] = tenantId ? [tenantId, null] : [null];

  for (const candidate of scopes) {
    const ck = cacheKey(candidate, key);
    const hit = cache.get(ck);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const row = await withSystemScope('read secret', (db) =>
      db.secretSetting.findFirst({
        where: { tenantId: candidate, key },
        select: { ciphertext: true, iv: true, authTag: true, wrappedKey: true, keyVersion: true, expiresAt: true },
      }),
    );
    if (!row) continue;
    if (row.expiresAt && row.expiresAt <= new Date()) continue;

    try {
      const value = open(
        {
          ciphertext: row.ciphertext,
          iv: row.iv,
          authTag: row.authTag,
          wrappedKey: row.wrappedKey,
          keyVersion: row.keyVersion,
        },
        buildAad(candidate, key, row.keyVersion),
      );
      cache.set(ck, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    } catch {
      // A row that will not decrypt is treated as absent: it may have been
      // moved between tenants, which the AAD is designed to reject.
      continue;
    }
  }
  return null;
}

export async function rotateSecret(
  scope: SecretScope,
  key: SecretKey,
  newPlaintext: string,
  actor: { userId?: string | null },
): Promise<void> {
  await setSecret(scope, key, newPlaintext, actor);
}

export async function deleteSecret(scope: SecretScope, key: SecretKey): Promise<void> {
  const tenantId = scope.tenantId ?? null;
  await withSystemScope('delete secret', (db) => db.secretSetting.deleteMany({ where: { tenantId, key } }));
  cache.delete(cacheKey(tenantId, key));
}

export type SecretMetadata = {
  key: string;
  hint: string | null;
  keyVersion: number;
  rotatedAt: Date | null;
  expiresAt: Date | null;
  createdBy: string | null;
  updatedAt: Date;
  expiringSoon: boolean;
};

/** Metadata only — this is everything the admin UI is ever given. */
export async function listSecrets(scope: SecretScope): Promise<SecretMetadata[]> {
  const rows = await withSystemScope('list secrets', (db) =>
    db.secretSetting.findMany({
      where: { tenantId: scope.tenantId ?? null },
      select: {
        key: true,
        hint: true,
        keyVersion: true,
        rotatedAt: true,
        expiresAt: true,
        createdBy: true,
        updatedAt: true,
      },
      orderBy: { key: 'asc' },
    }),
  );
  const warnAt = Date.now() + 14 * 24 * 60 * 60 * 1000;
  return rows.map((row) => ({
    ...row,
    expiringSoon: row.expiresAt !== null && row.expiresAt.getTime() <= warnAt,
  }));
}

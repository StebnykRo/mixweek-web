import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import { clearSecretCache, deleteSecret, getSecret, isSecretKey, listSecrets, rotateSecret, setSecret } from '@/lib/crypto/secrets';
import { adminDb, createTenantFixture, resetDatabase, type TenantFixture } from '../fixtures';

/** docs/12-security.md §2.2 — secrets at rest, and what the admin can see. */

let fixture: TenantFixture;

beforeEach(async () => {
  await resetDatabase();
  clearSecretCache();
  fixture = await createTenantFixture({ slug: 'sec', userCount: 1 });
});

afterAll(async () => {
  await resetDatabase();
  await adminDb.$disconnect();
  await prisma.$disconnect();
});

const actor = { userId: null };

describe('storage', () => {
  it('round-trips a platform secret', async () => {
    await setSecret({}, 'maps.api_key', 'super-secret-value', actor);
    expect(await getSecret('maps.api_key')).toBe('super-secret-value');
  });

  it('round-trips a tenant secret', async () => {
    await setSecret({ tenantId: fixture.tenantId }, 'mail.resend_api_key', 're_tenant', actor);
    expect(await getSecret('mail.resend_api_key', { tenantId: fixture.tenantId })).toBe('re_tenant');
  });

  it('never stores the plaintext', async () => {
    await setSecret({}, 'sentry.dsn', 'https://key@sentry.example/1', actor);
    const row = await adminDb.secretSetting.findFirst({ where: { key: 'sentry.dsn' } });
    expect(Buffer.from(row!.ciphertext).toString('utf8')).not.toContain('sentry.example');
  });

  it('falls back from tenant scope to the platform secret', async () => {
    await setSecret({}, 'mail.resend_api_key', 're_platform', actor);
    clearSecretCache();
    expect(await getSecret('mail.resend_api_key', { tenantId: fixture.tenantId })).toBe('re_platform');
  });

  it('prefers the tenant secret over the platform one', async () => {
    await setSecret({}, 'mail.resend_api_key', 're_platform', actor);
    await setSecret({ tenantId: fixture.tenantId }, 'mail.resend_api_key', 're_tenant', actor);
    clearSecretCache();
    expect(await getSecret('mail.resend_api_key', { tenantId: fixture.tenantId })).toBe('re_tenant');
  });

  it('returns null for a secret that was never set', async () => {
    expect(await getSecret('checkin.signing_key', { tenantId: fixture.tenantId })).toBeNull();
  });

  it('will not accept a key outside the closed registry', async () => {
    expect(isSecretKey('maps.api_key')).toBe(true);
    expect(isSecretKey('webhook.slack.secret')).toBe(true);
    expect(isSecretKey('integration.hr.token')).toBe(true);
    expect(isSecretKey('arbitrary.key')).toBe(false);
    await expect(setSecret({}, 'arbitrary.key', 'x', actor)).rejects.toThrow(/Unknown secret key/);
  });
});

describe('rotation', () => {
  it('replaces the value and bumps the version', async () => {
    await setSecret({}, 'push.vapid_private', 'first', actor);
    const before = await adminDb.secretSetting.findFirst({ where: { key: 'push.vapid_private' } });

    await rotateSecret({}, 'push.vapid_private', 'second', actor);
    clearSecretCache();

    expect(await getSecret('push.vapid_private')).toBe('second');
    const after = await adminDb.secretSetting.findFirst({ where: { key: 'push.vapid_private' } });
    expect(after!.keyVersion).toBe(before!.keyVersion + 1);
    expect(after!.rotatedAt).not.toBeNull();
  });

  it('cannot decrypt an old ciphertext at the new version — the AAD binds them', async () => {
    await setSecret({}, 'maps.api_key', 'v1-value', actor);
    const original = await adminDb.secretSetting.findFirst({ where: { key: 'maps.api_key' } });

    await rotateSecret({}, 'maps.api_key', 'v2-value', actor);

    // Put the old ciphertext back under the new version number.
    await adminDb.secretSetting.update({
      where: { id: original!.id },
      data: { ciphertext: original!.ciphertext, iv: original!.iv, authTag: original!.authTag, wrappedKey: original!.wrappedKey },
    });
    clearSecretCache();

    expect(await getSecret('maps.api_key')).toBeNull();
  });

  it('ignores a secret past its expiry', async () => {
    await setSecret({}, 'maps.api_key', 'expiring', actor, { expiresAt: new Date(Date.now() - 1000) });
    clearSecretCache();
    expect(await getSecret('maps.api_key')).toBeNull();
  });
});

describe('what the admin can see', () => {
  it('exposes a mask and metadata, never the value', async () => {
    await setSecret({ tenantId: fixture.tenantId }, 'maps.api_key', 'AIzaSyVeryLongKey4f2a', actor);
    const listed = await listSecrets({ tenantId: fixture.tenantId });
    const entry = listed.find((secret) => secret.key === 'maps.api_key');

    expect(entry?.hint).toBe('••••4f2a');
    expect(JSON.stringify(listed)).not.toContain('AIzaSyVeryLongKey');
  });

  it('flags a secret that expires within a fortnight', async () => {
    await setSecret({ tenantId: fixture.tenantId }, 'maps.api_key', 'value', actor, {
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    });
    const listed = await listSecrets({ tenantId: fixture.tenantId });
    expect(listed.find((secret) => secret.key === 'maps.api_key')?.expiringSoon).toBe(true);
  });

  it('does not list another tenant secret', async () => {
    const other = await createTenantFixture({ slug: 'sec2', userCount: 1 });
    await setSecret({ tenantId: other.tenantId }, 'maps.api_key', 'other-value', actor);

    const listed = await listSecrets({ tenantId: fixture.tenantId });
    expect(listed.find((secret) => secret.key === 'maps.api_key')).toBeUndefined();
  });
});

describe('deletion', () => {
  it('removes the secret and clears the cache', async () => {
    await setSecret({}, 'maps.api_key', 'value', actor);
    expect(await getSecret('maps.api_key')).toBe('value');

    await deleteSecret({}, 'maps.api_key');
    expect(await getSecret('maps.api_key')).toBeNull();
  });
});

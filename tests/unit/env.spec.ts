import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

/**
 * The bootstrap environment (docs/12-security.md §2.1).
 *
 * These cover the shape a real .env file has, rather than the tidy object a
 * test would otherwise construct: unused optional settings are present and
 * empty, not missing.
 */

const KEY = Buffer.alloc(32, 7).toString('base64');

const BASE: Record<string, string> = {
  APP_URL: 'https://events.example.com',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  AUTH_SECRET: 'x'.repeat(32),
  APP_MASTER_KEY: KEY,
};

async function loadEnv(vars: Record<string, string>) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('APP_') || key.startsWith('S3_') || key.startsWith('AUTH_') || key.startsWith('DATABASE_')) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, vars);
  // env() caches after the first read, so the module registry is reset rather
  // than re-imported under a different specifier.
  vi.resetModules();
  const mod = await import('@/lib/env');
  return mod.env();
}

describe('environment validation', () => {
  const original = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, { NODE_ENV: 'test' });
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, original);
  });

  it('accepts the required set', async () => {
    const parsed = await loadEnv(BASE);
    expect(parsed.APP_URL).toBe('https://events.example.com');
  });

  it('treats an empty optional value as absent', async () => {
    // How a .env file actually looks when a setting is deliberately unused.
    // Before this, `S3_ENDPOINT=` failed as "Invalid url" and
    // `APP_MASTER_KEY_PREVIOUS=` as a malformed key, taking down every request
    // on a perfectly valid deployment.
    const parsed = await loadEnv({
      ...BASE,
      APP_MASTER_KEY_PREVIOUS: '',
      S3_ENDPOINT: '',
      S3_BUCKET: '',
    });

    expect(parsed.APP_MASTER_KEY_PREVIOUS).toBeUndefined();
    expect(parsed.S3_ENDPOINT).toBeUndefined();
  });

  it('still rejects a malformed optional value that is actually set', async () => {
    await expect(loadEnv({ ...BASE, S3_ENDPOINT: 'not-a-url' })).rejects.toThrow(/S3_ENDPOINT/);
  });

  it('rejects a master key of the wrong length', async () => {
    await expect(loadEnv({ ...BASE, APP_MASTER_KEY: 'c2hvcnQ=' })).rejects.toThrow(/APP_MASTER_KEY/);
  });

  it('never echoes a value into the error message', async () => {
    // docs/12 §2.1 — a start-up failure must not leak what was configured.
    const secret = 'super-secret-value-that-must-not-appear';
    await expect(loadEnv({ ...BASE, APP_MASTER_KEY: secret })).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(secret) }) as Error,
    );
  });
});

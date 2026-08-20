import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAad, open, rewrap, seal, getMasterKey } from '@/lib/crypto/envelope';
import {
  hashSecretValue,
  hmac,
  randomBase32Code,
  randomNumericCode,
  randomToken,
  sha256,
  timingSafeEqual,
  verifySecretValue,
} from '@/lib/crypto/hash';

/** docs/14-qa.md §1 — lib/crypto carries a 95% bar; these are its guarantees. */

describe('envelope encryption', () => {
  it('round-trips a value', () => {
    const aad = buildAad('tenant-a', 'mail.smtp_password', 1);
    const sealed = seal('hunter2', aad);
    expect(open(sealed, aad)).toBe('hunter2');
  });

  it('produces a different ciphertext every time', () => {
    const aad = buildAad('tenant-a', 'mail.smtp_password', 1);
    const first = seal('same value', aad);
    const second = seal('same value', aad);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
    expect(Buffer.from(first.wrappedKey).equals(Buffer.from(second.wrappedKey))).toBe(false);
  });

  it('uses a unique data key per secret', () => {
    const aad = buildAad(null, 'push.vapid_private', 1);
    const a = seal('a', aad);
    const b = seal('b', aad);
    expect(Buffer.from(a.wrappedKey).equals(Buffer.from(b.wrappedKey))).toBe(false);
  });

  it('refuses to decrypt with another tenant AAD — a moved row stays unreadable', () => {
    const sealed = seal('tenant-a secret', buildAad('tenant-a', 'maps.api_key', 1));
    expect(() => open(sealed, buildAad('tenant-b', 'maps.api_key', 1))).toThrow(/Unable to decrypt/);
  });

  it('refuses to decrypt under a different key name', () => {
    const sealed = seal('value', buildAad('tenant-a', 'maps.api_key', 1));
    expect(() => open(sealed, buildAad('tenant-a', 'sentry.dsn', 1))).toThrow();
  });

  it('refuses to decrypt at a different key version', () => {
    const sealed = seal('value', buildAad('tenant-a', 'maps.api_key', 1), 1);
    expect(() => open(sealed, buildAad('tenant-a', 'maps.api_key', 2))).toThrow();
  });

  it('detects a tampered ciphertext through the auth tag', () => {
    const aad = buildAad('tenant-a', 'maps.api_key', 1);
    const sealed = seal('value', aad);
    const tampered = { ...sealed, ciphertext: new Uint8Array(sealed.ciphertext) };
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => open(tampered, aad)).toThrow();
  });

  it('re-wraps a data key under a new master key without touching the plaintext', () => {
    const aad = buildAad('tenant-a', 'maps.api_key', 1);
    const sealed = seal('rotate me', aad);
    const newKek = randomBytes(32);

    const rewrapped = { ...sealed, wrappedKey: rewrap(sealed.wrappedKey, getMasterKey(), newKek) };
    // The old KEK can no longer open it, which is the point of the rotation.
    expect(() => open(rewrapped, aad)).toThrow();
    expect(Buffer.from(rewrapped.wrappedKey).equals(Buffer.from(sealed.wrappedKey))).toBe(false);
  });
});

describe('token generation', () => {
  it('produces high-entropy, url-safe tokens', () => {
    const token = randomToken(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(new Set(Array.from({ length: 200 }, () => randomToken(32))).size).toBe(200);
  });

  it('produces six-digit codes across the whole range', () => {
    const codes = Array.from({ length: 500 }, () => randomNumericCode(6));
    expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(400);
  });

  it('produces base32 codes without ambiguous characters', () => {
    const code = randomBase32Code(6);
    expect(code).toHaveLength(6);
    // No 0/O/1/I/L/U — they are misread when someone types a code from a screen.
    expect(code).not.toMatch(/[0O1ILU]/);
  });
});

describe('hashing and comparison', () => {
  it('sha256 is stable and hex-encoded', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hmac is keyed — the same input under a different pepper differs', () => {
    expect(hmac('user-1', 'pepper-a')).not.toBe(hmac('user-1', 'pepper-b'));
    expect(hmac('user-1', 'pepper-a')).toBe(hmac('user-1', 'pepper-a'));
  });

  it('compares in constant time and tolerates a length mismatch', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcdef')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('hashes a recovery code so the stored value is not the code', async () => {
    const hash = await hashSecretValue('ABCDE-FGHIJ');
    expect(hash).not.toContain('ABCDE');
    expect(await verifySecretValue(hash, 'ABCDE-FGHIJ')).toBe(true);
    expect(await verifySecretValue(hash, 'ABCDE-FGHIK')).toBe(false);
  });

  it('salts each hash, so two identical codes look different at rest', async () => {
    expect(await hashSecretValue('SAME-CODE')).not.toBe(await hashSecretValue('SAME-CODE'));
  });
});

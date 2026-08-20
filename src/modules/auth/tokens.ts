import type { TokenPurpose } from '@prisma/client';
import { globalDb } from '@/lib/db/client';
import { hmac, randomNumericCode, randomToken, sha256, timingSafeEqual } from '@/lib/crypto/hash';

/**
 * docs/03-auth.md §2 — one-time tokens. TTL 10 minutes, five attempts, bound to
 * the browser where the login started so a link opened elsewhere still needs
 * the code typed back into the original tab (anti-phishing).
 */

export const TOKEN_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

export type IssuedToken = {
  id: string;
  /** The magic-link token. Goes into the email URL, never stored. */
  linkToken: string;
  /** The six-digit code. Goes into the same email, never stored. */
  code: string;
  expiresAt: Date;
};

export function bindingHash(bindingValue: string): string {
  return hmac(`binding:${bindingValue}`);
}

/**
 * Longest life an out-of-band link may be given (scripts/ops-signin-link.ts).
 * Such a link carries no browser binding, so the six-digit code is always
 * demanded on arrival and the URL alone admits nobody — which is what makes a
 * longer window tolerable. Emailed links keep the ten-minute default.
 */
export const MAX_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueLoginTokens(
  identifier: string,
  binding: string | null,
  metadata?: Record<string, unknown>,
  ttlMs: number = TOKEN_TTL_MS,
): Promise<IssuedToken> {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new Error(`ttlMs must be between 1 and ${MAX_TTL_MS}`);
  }
  const linkToken = randomToken(32);
  const code = randomNumericCode(6);
  const expiresAt = new Date(Date.now() + ttlMs);
  const hash = binding ? bindingHash(binding) : null;

  // Any pending token for this identifier is burned: one live challenge at a time.
  await globalDb.verificationToken.updateMany({
    where: { identifier, purpose: { in: ['MAGIC_LINK', 'EMAIL_OTP'] }, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const record = await globalDb.verificationToken.create({
    data: {
      identifier,
      tokenHash: sha256(linkToken),
      purpose: 'MAGIC_LINK',
      bindingHash: hash,
      maxAttempts: MAX_ATTEMPTS,
      expiresAt,
      metadata: { ...(metadata ?? {}), codeHash: sha256(code) },
    },
    select: { id: true },
  });

  return { id: record.id, linkToken, code, expiresAt };
}

export type ConsumeResult =
  | { ok: true; identifier: string; metadata: Record<string, unknown>; bindingMatched: boolean }
  | { ok: false; reason: 'not_found' | 'expired' | 'consumed' | 'too_many_attempts' | 'mismatch' };

/** Redeems the magic-link token from the email URL. */
export async function consumeLinkToken(linkToken: string, binding: string | null): Promise<ConsumeResult> {
  const record = await globalDb.verificationToken.findUnique({
    where: { tokenHash: sha256(linkToken) },
  });
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.consumedAt) return { ok: false, reason: 'consumed' };
  if (record.expiresAt <= new Date()) return { ok: false, reason: 'expired' };

  const bindingMatched =
    record.bindingHash !== null && binding !== null && timingSafeEqual(record.bindingHash, bindingHash(binding));

  if (bindingMatched) {
    await globalDb.verificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  }

  return {
    ok: true,
    identifier: record.identifier,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    bindingMatched,
  };
}

/** Redeems the six-digit code typed into the tab where the login started. */
export async function consumeCode(identifier: string, code: string, binding: string | null): Promise<ConsumeResult> {
  const record = await globalDb.verificationToken.findFirst({
    where: { identifier, purpose: 'MAGIC_LINK', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.expiresAt <= new Date()) return { ok: false, reason: 'expired' };
  if (record.attempts >= record.maxAttempts) {
    await globalDb.verificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, reason: 'too_many_attempts' };
  }

  const metadata = (record.metadata as Record<string, unknown>) ?? {};
  const expected = typeof metadata.codeHash === 'string' ? metadata.codeHash : '';
  const matches = expected.length > 0 && timingSafeEqual(expected, sha256(code));

  if (!matches) {
    const attempts = record.attempts + 1;
    await globalDb.verificationToken.update({
      where: { id: record.id },
      data: {
        attempts,
        // Burn the token on the last failed attempt rather than leaving it live.
        ...(attempts >= record.maxAttempts ? { consumedAt: new Date() } : {}),
      },
    });
    return { ok: false, reason: 'mismatch' };
  }

  const bindingMatched =
    record.bindingHash === null || (binding !== null && timingSafeEqual(record.bindingHash, bindingHash(binding)));

  await globalDb.verificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return { ok: true, identifier: record.identifier, metadata, bindingMatched };
}

export async function issueGenericToken(
  identifier: string,
  purpose: TokenPurpose,
  ttlMs: number,
  metadata?: Record<string, unknown>,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlMs);
  await globalDb.verificationToken.create({
    data: {
      identifier,
      tokenHash: sha256(token),
      purpose,
      expiresAt,
      metadata: (metadata ?? {}) as never,
    },
  });
  return { token, expiresAt };
}

export async function consumeGenericToken(
  token: string,
  purpose: TokenPurpose,
): Promise<{ identifier: string; metadata: Record<string, unknown> } | null> {
  const record = await globalDb.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.purpose !== purpose) return null;
  if (record.consumedAt || record.expiresAt <= new Date()) return null;
  await globalDb.verificationToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return { identifier: record.identifier, metadata: (record.metadata as Record<string, unknown>) ?? {} };
}

/** docs/02 §5 — retention: expired tokens are removed 24 h after they lapse. */
export async function purgeExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await globalDb.verificationToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });
  return result.count;
}

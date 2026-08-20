import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import { getSecret, setSecret } from '@/lib/crypto/secrets';
import { randomToken } from '@/lib/crypto/hash';

/**
 * docs/06-events.md §4.6 — the QR carries a short-lived signed token, not an id.
 *
 * TTL 60 s, refreshed on screen every 30 s. A screenshot of somebody else's QR
 * is worthless within a minute, which is the whole point of not encoding the
 * registration id directly.
 */

export type TokenAudience = 'checkin' | 'pickup';

const TTL_SECONDS: Record<TokenAudience, number> = { checkin: 60, pickup: 60 };
const SECRET_KEY: Record<TokenAudience, 'checkin.signing_key' | 'pickup.signing_key'> = {
  checkin: 'checkin.signing_key',
  pickup: 'pickup.signing_key',
};

async function signingKey(audience: TokenAudience): Promise<string> {
  const existing = await getSecret(SECRET_KEY[audience]);
  if (existing) return existing;
  // First use bootstraps the key. It lives in SecretSetting like every other
  // secret — never in .env (docs/12 §2.1).
  const generated = randomToken(32);
  await setSecret({}, SECRET_KEY[audience], generated, { userId: null });
  return generated;
}

export type SignedToken = { token: string; expiresAt: Date; ttlSeconds: number };

export async function issueSignedToken(
  audience: TokenAudience,
  subject: string,
  tenantId: string,
): Promise<SignedToken> {
  const ttl = TTL_SECONDS[audience];
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${audience}.${tenantId}.${subject}.${exp}`;
  const key = await signingKey(audience);
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return {
    token: `${Buffer.from(payload).toString('base64url')}.${signature}`,
    expiresAt: new Date(exp * 1000),
    ttlSeconds: ttl,
  };
}

export type VerifyResult =
  | { ok: true; subject: string; tenantId: string }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'audience' | 'tenant' };

export async function verifySignedToken(
  audience: TokenAudience,
  token: string,
  tenantId: string,
): Promise<VerifyResult> {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [encoded, signature] = parts as [string, string];

  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const fields = payload.split('.');
  if (fields.length !== 4) return { ok: false, reason: 'malformed' };
  const [tokenAudience, tokenTenant, subject, expRaw] = fields as [string, string, string, string];

  const key = await signingKey(audience);
  const expected = createHmac('sha256', key).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !nodeTimingSafeEqual(a, b)) return { ok: false, reason: 'signature' };

  if (tokenAudience !== audience) return { ok: false, reason: 'audience' };
  if (tokenTenant !== tenantId) return { ok: false, reason: 'tenant' };
  if (Number(expRaw) * 1000 <= Date.now()) return { ok: false, reason: 'expired' };

  return { ok: true, subject, tenantId: tokenTenant };
}

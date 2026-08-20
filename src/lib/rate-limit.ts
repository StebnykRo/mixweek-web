import { AppError } from './errors';
import { hmac } from './crypto/hash';
import { kvIncr, redisAvailable } from './redis';
import { isHardenedEnv } from './app-env';

/**
 * docs/03-auth.md §7 — the single source of truth for limits. Sliding window
 * over fixed buckets in Redis, keyed `rl:{scope}:{subject}:{window}`.
 *
 * Auth endpoints fail CLOSED when Redis is down (docs/12 §8): refusing a login
 * is better than handing an attacker an unmetered brute-force window. Content
 * reads fail open.
 */

export type LimitRule = {
  /** Requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export const LIMITS = {
  'auth.start.email': { limit: 5, windowSeconds: 3600 },
  'auth.start.ip.hour': { limit: 20, windowSeconds: 3600 },
  'auth.start.ip.minute': { limit: 3, windowSeconds: 60 },
  'auth.start.subnet': { limit: 100, windowSeconds: 3600 },
  'auth.verify.ip': { limit: 10, windowSeconds: 3600 },
  'auth.mfa.verify': { limit: 5, windowSeconds: 900 },
  'auth.mfa.recovery': { limit: 5, windowSeconds: 86_400 },
  'api.authenticated': { limit: 120, windowSeconds: 60 },
  'api.anonymous': { limit: 30, windowSeconds: 60 },
  'admin.mutation': { limit: 60, windowSeconds: 60 },
  'analytics.ingest': { limit: 60, windowSeconds: 60 },
  'csp.report': { limit: 60, windowSeconds: 60 },
  'media.report': { limit: 10, windowSeconds: 3600 },
} as const satisfies Record<string, LimitRule>;

export type LimitScope = keyof typeof LIMITS;

/** Scopes where an unavailable limiter must block rather than wave through. */
const FAIL_CLOSED = new Set<LimitScope>([
  'auth.start.email',
  'auth.start.ip.hour',
  'auth.start.ip.minute',
  'auth.start.subnet',
  'auth.verify.ip',
  'auth.mfa.verify',
  'auth.mfa.recovery',
]);

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
};

/**
 * End-to-end runs make dozens of legitimate sign-in attempts from one address,
 * which the real limits would block. The multiplier exists for that, and is
 * ignored outright in production so it cannot weaken a live deployment.
 */
function effectiveLimit(rule: LimitRule): number {
  if (isHardenedEnv()) return rule.limit;
  const multiplier = Number(process.env.RATE_LIMIT_MULTIPLIER ?? '1');
  return Number.isFinite(multiplier) && multiplier > 1 ? Math.ceil(rule.limit * multiplier) : rule.limit;
}

export async function checkRateLimit(scope: LimitScope, subject: string): Promise<RateLimitResult> {
  const rule = { ...LIMITS[scope], limit: effectiveLimit(LIMITS[scope]) };
  if (!redisAvailable() && FAIL_CLOSED.has(scope) && isHardenedEnv()) {
    return { ok: false, limit: rule.limit, remaining: 0, resetSeconds: rule.windowSeconds };
  }

  const window = Math.floor(Date.now() / 1000 / rule.windowSeconds);
  const key = `rl:${scope}:${hmac(subject).slice(0, 32)}:${window}`;
  const { count, ttlSeconds } = await kvIncr(key, rule.windowSeconds);

  return {
    ok: count <= rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetSeconds: ttlSeconds > 0 ? ttlSeconds : rule.windowSeconds,
  };
}

export class RateLimitedError extends AppError {
  readonly retryAfter: number;
  readonly result: RateLimitResult;

  constructor(result: RateLimitResult) {
    super('RATE_LIMITED');
    this.retryAfter = result.resetSeconds;
    this.result = result;
  }
}

/** Throws on breach. The 429 body carries no reason — that is a probe channel. */
export async function rateLimit(scope: LimitScope, subject: string): Promise<RateLimitResult> {
  const result = await checkRateLimit(scope, subject);
  if (!result.ok) throw new RateLimitedError(result);
  return result;
}

/** Progressive delay after repeated failures (docs/03 §7): 100 ms → 2 s. */
export function progressiveDelayMs(failures: number): number {
  if (failures <= 2) return 0;
  return Math.min(2000, 100 * 2 ** (failures - 3));
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

import pino from 'pino';
import { env } from './env';

/**
 * docs/12-security.md §9 — the scrubber lives in the logger, not in the caller's
 * memory. Only allow-listed fields are ever serialised; everything else is
 * dropped, so "we forgot to redact it" cannot happen at a call site.
 */
const ALLOWED_FIELDS = new Set([
  'requestId',
  'tenantId',
  'userRef',
  'route',
  'method',
  'status',
  'durationMs',
  'bytes',
  'code',
  'action',
  'entityType',
  'entityId',
  'queue',
  'jobId',
  'attempt',
  'kind',
  'channel',
  'count',
  'msg',
  'err',
  'reason',
  'emailMasked',
  'ipHash',
  'phase',
]);

const SENSITIVE_KEY = /token|secret|password|cookie|authorization|otp|code|key|ciphertext|p256dh|auth|endpoint/i;

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const first = email[0] ?? '*';
  return `${first}***${email.slice(at)}`;
}

function scrub(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[deep]';
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return input.length > 512 ? `${input.slice(0, 512)}…` : input;
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (input instanceof Error) return { name: input.name, message: input.message };
  if (Array.isArray(input)) return input.slice(0, 20).map((v) => scrub(v, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) continue;
      if (depth === 0 && !ALLOWED_FIELDS.has(key)) continue;
      out[key] = scrub(value, depth + 1);
    }
    return out;
  }
  return '[unserialisable]';
}

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

export const logger = pino({
  level,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    log: (object) => scrub(object) as Record<string, unknown>,
  },
});

/**
 * The error reporter. Sentry plugs in here; without a DSN it is a no-op, so no
 * code path depends on an external service being configured.
 */
type Reporter = (error: unknown, context: Record<string, unknown>) => void;
let reporter: Reporter | null = null;

export function setErrorReporter(fn: Reporter): void {
  reporter = fn;
}

export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  const safeContext = scrub(context) as Record<string, unknown>;
  logger.error({ ...safeContext, err: error instanceof Error ? error : new Error(String(error)) }, 'error');
  try {
    reporter?.(error, safeContext);
  } catch {
    // A failing reporter must never take the request down.
  }
}

export { env };

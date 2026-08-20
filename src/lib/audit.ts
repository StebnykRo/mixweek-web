import { withSystemScope } from './db/tenant-client';
import { hmac } from './crypto/hash';
import { logger } from './logger';

/**
 * CLAUDE.md §5.2 rule 8 — every mutation writes an AuditLog entry.
 * The diff is stored with sensitive fields stripped, never raw.
 */

const REDACTED_FIELDS = new Set([
  'tokens',
  'tokenHash',
  'ciphertext',
  'iv',
  'authTag',
  'wrappedKey',
  'secretEnc',
  'codeHash',
  'checkInCodeHash',
  'pickupCodeHash',
  'p256dh',
  'auth',
  'endpoint',
  'answers',
  'password',
]);

export function redactDiff(input: unknown, depth = 0): unknown {
  if (depth > 5 || input === null || input === undefined) return input;
  if (Array.isArray(input)) return input.slice(0, 50).map((v) => redactDiff(v, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = REDACTED_FIELDS.has(key) ? '[redacted]' : redactDiff(value, depth + 1);
    }
    return out;
  }
  if (typeof input === 'string' && input.length > 500) return `${input.slice(0, 500)}…`;
  return input;
}

export type AuditInput = {
  tenantId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

export async function auditLog(input: AuditInput): Promise<void> {
  try {
    // Audit entries are append-only and may be platform-level (tenantId null),
    // so they are written in the system scope; the tenantId is always stamped
    // from the caller's session.
    await withSystemScope('write audit entry', (db) =>
      db.auditLog.create({
        data: {
          tenantId: input.tenantId ?? null,
          actorId: input.actorId ?? null,
          actorEmailHash: input.actorEmail ? hmac(input.actorEmail) : null,
          actorRole: input.actorRole ?? null,
          action: input.action,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          diff: (redactDiff(input.diff) ?? null) as never,
          ipHash: input.ip ? hmac(input.ip) : null,
          userAgent: input.userAgent?.slice(0, 255) ?? null,
          requestId: input.requestId ?? null,
        },
      }),
    );
  } catch (error) {
    // A failed audit write must be loud, but it must not swallow the response
    // the user is waiting for.
    logger.error({ action: input.action, reason: (error as Error).message }, 'audit-write-failed');
  }
}

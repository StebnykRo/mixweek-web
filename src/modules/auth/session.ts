import type { Role } from '@prisma/client';
import { globalDb } from '@/lib/db/client';
import { withSystemScope } from '@/lib/db/tenant-client';
import { hmac, randomToken, sha256 } from '@/lib/crypto/hash';
import { isStaffRole } from './policies';
import { isHardenedEnv } from '@/lib/app-env';

/**
 * docs/03-auth.md §4 — database sessions, so a revoke takes effect instantly.
 * Only the SHA-256 of the token is stored; the token itself exists in the
 * cookie and nowhere else.
 */

/**
 * docs/03-auth.md §4 — production uses the `__Host-` prefix, which browsers only
 * accept on a Secure cookie with Path=/ and no Domain. Over plain http (local
 * development and the e2e run) the browser would silently drop such a cookie,
 * so the prefix is applied exactly when the connection can carry it.
 */
export const secureCookies = (): boolean => isHardenedEnv() || process.env.FORCE_SECURE_COOKIES === '1';

const prefixed = (name: string) => (secureCookies() ? `__Host-${name}` : name);

export const sessionCookieName = () => prefixed('mw.session');
export const bindingCookieName = () => prefixed('mw.binding');
export const trustedDeviceCookieName = () => prefixed('mw.trusted');

/** Both spellings are read, so a cookie set before a scheme change still works. */
export const SESSION_COOKIE_NAMES = ['__Host-mw.session', 'mw.session'] as const;
export const BINDING_COOKIE_NAMES = ['__Host-mw.binding', 'mw.binding'] as const;
export const TRUSTED_DEVICE_COOKIE_NAMES = ['__Host-mw.trusted', 'mw.trusted'] as const;

const PARTICIPANT_ROLLING_MS = 7 * 24 * 60 * 60 * 1000;
const PARTICIPANT_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
const STAFF_ROLLING_MS = 12 * 60 * 60 * 1000;
const STAFF_ABSOLUTE_MS = 24 * 60 * 60 * 1000;
export const MAX_SESSIONS_PER_USER = 10;

export type SessionContext = {
  sessionId: string;
  userId: string;
  tenantId: string | null;
  role: Role | null;
  mfaSatisfied: boolean;
  stepUpAt: Date | null;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    locale: string;
    status: string;
    department: string | null;
    team: string | null;
    jobTitle: string | null;
    avatarUrl: string | null;
  };
};

export function sessionLifetimes(role: Role | null): { rolling: number; absolute: number } {
  return isStaffRole(role)
    ? { rolling: STAFF_ROLLING_MS, absolute: STAFF_ABSOLUTE_MS }
    : { rolling: PARTICIPANT_ROLLING_MS, absolute: PARTICIPANT_ABSOLUTE_MS };
}

export type CreateSessionInput = {
  userId: string;
  tenantId: string | null;
  role: Role | null;
  mfaSatisfied: boolean;
  ip?: string | null;
  userAgent?: string | null;
  deviceLabel?: string | null;
};

export async function createSession(input: CreateSessionInput): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = randomToken(32);
  const now = Date.now();
  const { rolling, absolute } = sessionLifetimes(input.role);

  const session = await globalDb.session.create({
    data: {
      tokenHash: sha256(token),
      userId: input.userId,
      tenantId: input.tenantId,
      mfaSatisfied: input.mfaSatisfied,
      ipHash: input.ip ? hmac(input.ip) : null,
      userAgent: input.userAgent?.slice(0, 255) ?? null,
      deviceLabel: input.deviceLabel?.slice(0, 80) ?? null,
      expiresAt: new Date(now + rolling),
      absoluteExpiresAt: new Date(now + absolute),
    },
    select: { id: true, expiresAt: true },
  });

  await enforceSessionCap(input.userId);
  return { token, sessionId: session.id, expiresAt: session.expiresAt };
}

/** docs/12 §8 — at most 10 live sessions; the oldest are evicted. */
async function enforceSessionCap(userId: string): Promise<void> {
  const live = await globalDb.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: { id: true },
  });
  const excess = live.slice(MAX_SESSIONS_PER_USER).map((s) => s.id);
  if (excess.length) {
    await globalDb.session.updateMany({
      where: { id: { in: excess } },
      data: { revokedAt: new Date(), revokedReason: 'session_limit' },
    });
  }
}

export async function readSession(token: string | undefined | null): Promise<SessionContext | null> {
  if (!token) return null;
  const now = new Date();

  const session = await globalDb.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      userId: true,
      tenantId: true,
      mfaSatisfied: true,
      stepUpAt: true,
      expiresAt: true,
      absoluteExpiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          locale: true,
          status: true,
          department: true,
          team: true,
          jobTitle: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= now || session.absoluteExpiresAt <= now) return null;
  if (session.user.status === 'SUSPENDED' || session.user.status === 'DELETED') return null;

  // The membership carries the role for this session. It is read by primary key
  // before any tenant scope exists — this lookup is what establishes it.
  const membership = session.tenantId
    ? await withSystemScope('read session membership', (db) =>
        db.membership.findUnique({
          where: { userId_tenantId: { userId: session.userId, tenantId: session.tenantId as string } },
          select: { role: true, status: true },
        }),
      )
    : null;

  if (session.tenantId && (!membership || membership.status !== 'ACTIVE')) return null;

  return {
    sessionId: session.id,
    userId: session.userId,
    tenantId: session.tenantId,
    role: membership?.role ?? null,
    mfaSatisfied: session.mfaSatisfied,
    stepUpAt: session.stepUpAt,
    expiresAt: session.expiresAt,
    user: session.user,
  };
}

/** Sliding expiry, written at most once a minute to avoid a write per request. */
export async function touchSession(sessionId: string, role: Role | null): Promise<Date | null> {
  const { rolling, absolute } = sessionLifetimes(role);
  const now = Date.now();
  const session = await globalDb.session.findUnique({
    where: { id: sessionId },
    select: { lastSeenAt: true, createdAt: true },
  });
  if (!session) return null;
  if (now - session.lastSeenAt.getTime() < 60_000) return null;

  const absoluteEnd = session.createdAt.getTime() + absolute;
  const nextExpiry = new Date(Math.min(now + rolling, absoluteEnd));
  await globalDb.session.update({
    where: { id: sessionId },
    data: { lastSeenAt: new Date(now), expiresAt: nextExpiry },
  });
  return nextExpiry;
}

/**
 * docs/03 §4 — the session token is rotated after the second factor and on any
 * privilege change, which closes session fixation.
 */
export async function rotateSessionToken(sessionId: string): Promise<string> {
  const token = randomToken(32);
  await globalDb.session.update({
    where: { id: sessionId },
    data: { tokenHash: sha256(token) },
  });
  return token;
}

export async function markMfaSatisfied(sessionId: string): Promise<void> {
  await globalDb.session.update({
    where: { id: sessionId },
    data: { mfaSatisfied: true, stepUpAt: new Date() },
  });
}

export async function markStepUp(sessionId: string): Promise<void> {
  await globalDb.session.update({ where: { id: sessionId }, data: { stepUpAt: new Date() } });
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await globalDb.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string): Promise<number> {
  const result = await globalDb.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

export async function listSessions(userId: string) {
  return globalDb.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      userAgent: true,
      deviceLabel: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

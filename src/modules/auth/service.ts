import type { Role } from '@prisma/client';
import { globalDb } from '@/lib/db/client';
import { withSystemScope } from '@/lib/db/tenant-client';
import { env } from '@/lib/env';
import { hmac, randomToken, sha256 } from '@/lib/crypto/hash';
import { auditLog } from '@/lib/audit';
import { sendMail } from '@/lib/mail';
import { logger, maskEmail } from '@/lib/logger';
import { getSetting, getMfaPolicy } from '@/modules/tenancy/settings';
import { resolveTenantByEmailDomain, normaliseEmail, emailDomain, type ResolvedTenant } from '@/modules/tenancy/service';
import { resolveBrand } from '@/modules/branding/service';
import { NEUTRAL_BRAND, type PublicBrand } from '@/modules/branding/default-brand';
import { renderLoginEmail, renderSecurityNotice } from './emails';
import { consumeCode, consumeLinkToken, issueLoginTokens, TOKEN_TTL_MS } from './tokens';
import { createSession, markMfaSatisfied, revokeAllSessions, rotateSessionToken } from './session';
import { hasConfirmedTotp } from './totp';
import { isStaffRole } from './policies';
import { providers } from './providers';

/**
 * docs/03-auth.md §2 — the login pipeline.
 *
 * The single most important property of this file: `startAuth` behaves
 * identically for a known address, an unknown address and a blocked domain.
 * Same shape, same status, same floor on the response time. The only
 * difference is whether an email actually goes out.
 */

const MIN_RESPONSE_MS = 400;

export type StartAuthInput = {
  email: string;
  ip: string | null;
  userAgent: string | null;
  binding: string | null;
  deviceHint: string;
};

export type StartAuthResult = {
  ok: true;
  brand: PublicBrand | null;
};

async function constantTime<T>(startedAt: number, value: T): Promise<T> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < MIN_RESPONSE_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
  }
  return value;
}

/** Is this address allowed in, either by a verified domain or a live invite? */
async function resolveAdmission(
  email: string,
): Promise<{ tenant: ResolvedTenant | null; viaInvite: boolean; inviteRole: Role | null; inviteEventId: string | null }> {
  const tenant = await resolveTenantByEmailDomain(email);
  if (tenant && tenant.autoJoin) return { tenant, viaInvite: false, inviteRole: null, inviteEventId: null };

  // Pre-authentication invite lookup, keyed by the address being verified.
  const invite = await withSystemScope('resolve invite for login', (db) =>
    db.invite.findFirst({
      where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { tenantId: true, role: true, eventId: true },
    }),
  );
  if (!invite) return { tenant: tenant && !tenant.autoJoin ? null : tenant, viaInvite: false, inviteRole: null, inviteEventId: null };

  const inviteTenant = await globalDb.tenant.findUnique({
    where: { id: invite.tenantId },
    select: { id: true, slug: true, name: true, locales: true, defaultLocale: true, timezone: true, status: true },
  });
  if (!inviteTenant || inviteTenant.status !== 'ACTIVE') {
    return { tenant: null, viaInvite: false, inviteRole: null, inviteEventId: null };
  }

  return {
    tenant: {
      tenantId: inviteTenant.id,
      tenantSlug: inviteTenant.slug,
      tenantName: inviteTenant.name,
      brandId: null,
      autoJoin: false,
      verified: true,
      locales: inviteTenant.locales,
      defaultLocale: inviteTenant.defaultLocale,
      timezone: inviteTenant.timezone,
    },
    viaInvite: true,
    inviteRole: invite.role,
    inviteEventId: invite.eventId,
  };
}

export async function startAuth(input: StartAuthInput): Promise<StartAuthResult> {
  const startedAt = Date.now();
  const email = normaliseEmail(input.email);
  const admission = await resolveAdmission(email);

  // The brand is public information, but only for a verified domain whose
  // tenant has brand.public switched on (docs/04 §2.1).
  let brand: PublicBrand | null = null;
  if (admission.tenant?.verified) {
    const isPublic = await getSetting('brand.public', { tenantId: admission.tenant.tenantId });
    if (isPublic) {
      brand = await resolveBrand({
        tenantId: admission.tenant.tenantId,
        domainBrandId: admission.tenant.brandId,
      });
    }
  }

  if (!admission.tenant) {
    await globalDb.loginAttempt.create({
      data: { emailHash: hmac(email), ipHash: hmac(input.ip ?? 'unknown'), success: false, reason: 'domain_not_allowed' },
    });
    logger.info({ emailMasked: maskEmail(email), reason: 'domain_not_allowed' }, 'auth-start-noop');
    return constantTime(startedAt, { ok: true, brand: brand ?? NEUTRAL_BRAND });
  }

  const tokens = await issueLoginTokens(email, input.binding, {
    tenantId: admission.tenant.tenantId,
    viaInvite: admission.viaInvite,
    inviteRole: admission.inviteRole,
    inviteEventId: admission.inviteEventId,
  });

  const effectiveBrand = brand ?? (await resolveBrand({ tenantId: admission.tenant.tenantId, domainBrandId: admission.tenant.brandId }));
  const supportEmail = (await getSetting('support.email', { tenantId: admission.tenant.tenantId })) as string;

  const mail = renderLoginEmail({
    appUrl: env().APP_URL,
    linkToken: tokens.linkToken,
    code: tokens.code,
    ttlMinutes: Math.round(TOKEN_TTL_MS / 60000),
    deviceHint: input.deviceHint,
    brand: effectiveBrand,
    supportEmail: supportEmail || 'support@mixweek.app',
  });

  await sendMail({ to: email, tenantId: admission.tenant.tenantId, ...mail });

  return constantTime(startedAt, { ok: true, brand: brand ?? NEUTRAL_BRAND });
}

export type CompleteLoginInput = {
  email: string;
  metadata: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  requestId?: string;
};

export type CompleteLoginResult = {
  sessionToken: string;
  sessionId: string;
  expiresAt: Date;
  userId: string;
  tenantId: string;
  role: Role;
  mfaSatisfied: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  isFirstLogin: boolean;
};

/**
 * The shared pipeline from docs/03 §3:
 *   resolveTenant → assertDomainAllowed → upsertUser → upsertMembership
 *   → linkAccount → applyMfaPolicy → createSession → audit
 */
export async function completeLogin(input: CompleteLoginInput): Promise<CompleteLoginResult> {
  const email = normaliseEmail(input.email);
  const tenantId = String(input.metadata.tenantId ?? '');
  if (!tenantId) throw new Error('Login token carries no tenant');

  const inviteRole = (input.metadata.inviteRole as Role | null) ?? null;
  const viaInvite = input.metadata.viaInvite === true;

  const existing = await globalDb.user.findUnique({ where: { email }, select: { id: true, lastLoginAt: true } });
  const isFirstLogin = !existing?.lastLoginAt;

  const user = await globalDb.user.upsert({
    where: { email },
    create: {
      email,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      primaryTenantId: tenantId,
      status: 'ACTIVE',
    },
    update: {
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
      // An INVITED record becomes ACTIVE at first sign-in (docs/10 §3.10).
      status: 'ACTIVE',
      primaryTenantId: existing ? undefined : tenantId,
    },
    select: { id: true, locale: true },
  });

  const membership = await withSystemScope('create membership at login', (db) =>
    db.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      create: {
        userId: user.id,
        tenantId,
        role: viaInvite ? (inviteRole ?? 'GUEST') : 'PARTICIPANT',
        status: 'ACTIVE',
      },
      update: { status: 'ACTIVE' },
      select: { role: true },
    }),
  );

  if (viaInvite) {
    await withSystemScope('accept invite', (db) =>
      db.invite.updateMany({
        where: { email, tenantId, acceptedAt: null },
        data: { acceptedAt: new Date() },
      }),
    );
  }

  const policy = await getMfaPolicy(tenantId);
  const enrolled = await hasConfirmedTotp(user.id);
  const mfaRequired =
    policy === 'REQUIRED_ALL' || (policy === 'REQUIRED_STAFF' && isStaffRole(membership.role)) || enrolled;

  const session = await createSession({
    userId: user.id,
    tenantId,
    role: membership.role,
    mfaSatisfied: !mfaRequired,
    ip: input.ip,
    userAgent: input.userAgent,
    deviceLabel: deviceLabelFrom(input.userAgent),
  });

  await globalDb.loginAttempt.create({
    data: { emailHash: hmac(email), ipHash: hmac(input.ip ?? 'unknown'), success: true, tenantId },
  });

  await auditLog({
    tenantId,
    actorId: user.id,
    actorEmail: email,
    actorRole: membership.role,
    action: 'auth.login',
    entityType: 'User',
    entityId: user.id,
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId ?? null,
    diff: { mfaRequired, viaInvite },
  });

  await maybeNotifyNewDevice(user.id, email, tenantId, input.userAgent, input.ip);

  return {
    sessionToken: session.token,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    userId: user.id,
    tenantId,
    role: membership.role,
    mfaSatisfied: !mfaRequired,
    mfaRequired,
    mfaEnrolled: enrolled,
    isFirstLogin,
  };
}

export function deviceLabelFrom(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent;
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Unknown OS';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Safari\//.test(ua)
        ? 'Safari'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : 'Browser';
  return `${browser} on ${os}`;
}

/** docs/11 §2 — SYSTEM notice on a sign-in from a device we have not seen. */
async function maybeNotifyNewDevice(
  userId: string,
  email: string,
  tenantId: string,
  userAgent: string | null,
  ip: string | null,
): Promise<void> {
  const label = deviceLabelFrom(userAgent);
  const seen = await globalDb.session.count({
    where: { userId, deviceLabel: label, revokedAt: null, createdAt: { lt: new Date(Date.now() - 1000) } },
  });
  if (seen > 0) return;

  const brand = await resolveBrand({ tenantId });
  const supportEmail = ((await getSetting('support.email', { tenantId })) as string) || 'support@mixweek.app';
  const notice = renderSecurityNotice(
    brand,
    'New sign-in to your account',
    `A new sign-in was completed from ${label}${ip ? ' (IP recorded)' : ''}.`,
    supportEmail,
  );
  await sendMail({ to: email, tenantId, ...notice });
}

/** docs/03 §4 — the session token rotates once the second factor is satisfied. */
export async function completeMfa(sessionId: string): Promise<string> {
  await markMfaSatisfied(sessionId);
  return rotateSessionToken(sessionId);
}

/** docs/03 §4 — a role change revokes every session that user holds. */
export async function revokeSessionsForPrivilegeChange(userId: string, reason: string): Promise<void> {
  await revokeAllSessions(userId, reason);
}

export { consumeCode, consumeLinkToken, providers, randomToken, sha256, emailDomain };

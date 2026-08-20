import { cookies } from 'next/headers';
import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { globalDb } from '@/lib/db/client';
import { hmac, randomToken, sha256 } from '@/lib/crypto/hash';
import { MfaVerifySchema } from '@/modules/auth/schemas';
import { verifyTotpCode } from '@/modules/auth/totp';
import { completeMfa, markStepUp, secureCookies, sessionCookieName, sessionCookieOptions, trustedDeviceCookieName } from '@/modules/auth';

export const dynamic = 'force-dynamic';

const TRUSTED_DEVICE_DAYS = 30;

/**
 * POST /api/v1/auth/mfa/verify
 *
 * Also serves step-up: when the session is already fully authenticated, a
 * successful code refreshes `stepUpAt` instead of flipping mfaSatisfied.
 */
export const POST = route({ auth: { mode: 'public' }, body: MfaVerifySchema, personal: true }, async ({ body, ctx }) => {
  const session = ctx.session;
  if (!session) throw new AppError('UNAUTHENTICATED');

  await rateLimit('auth.mfa.verify', session.userId);

  const valid = await verifyTotpCode(session.userId, body.code);
  await globalDb.loginAttempt.create({
    data: {
      emailHash: hmac(session.user.email),
      ipHash: hmac(ctx.ip ?? 'unknown'),
      success: valid,
      reason: valid ? 'mfa_ok' : 'mfa_invalid',
      tenantId: session.tenantId,
    },
  });
  if (!valid) throw new AppError('VALIDATION_FAILED', 'That code did not work');

  const jar = await cookies();

  if (session.mfaSatisfied) {
    await markStepUp(session.sessionId);
  } else {
    const token = await completeMfa(session.sessionId);
    jar.set(sessionCookieName(), token, sessionCookieOptions(session.expiresAt));
  }

  if (body.trustDevice) {
    const deviceToken = randomToken(32);
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000);
    await globalDb.trustedDevice.create({
      data: {
        userId: session.userId,
        // Bound to the user agent as well, so the cookie alone is not enough.
        tokenHash: sha256(`${deviceToken}:${ctx.userAgent ?? ''}`),
        label: session.user.email,
        expiresAt,
      },
    });
    jar.set(trustedDeviceCookieName(), deviceToken, {
      httpOnly: true,
      secure: secureCookies(),
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  await auditLog({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorEmail: session.user.email,
    action: session.mfaSatisfied ? 'auth.step_up' : 'auth.mfa_verified',
    ip: ctx.ip,
  });

  return { ok: true, stepUp: session.mfaSatisfied };
});

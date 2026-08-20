import { cookies } from 'next/headers';
import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { sendMail } from '@/lib/mail';
import { getSetting } from '@/modules/tenancy/settings';
import { resolveBrand } from '@/modules/branding/service';
import { renderSecurityNotice } from '@/modules/auth/emails';
import { RecoverySchema } from '@/modules/auth/schemas';
import { consumeRecoveryCode, countRemainingRecoveryCodes, resetTotp } from '@/modules/auth/totp';
import { completeMfa, sessionCookieName, sessionCookieOptions } from '@/modules/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/mfa/recovery
 *
 * A recovery code works once, clears the enrolled authenticator (the person has
 * lost it, by definition) and always sends an email — an unexpected notice here
 * is the signal that someone else got in.
 */
export const POST = route({ auth: { mode: 'public' }, body: RecoverySchema, personal: true }, async ({ body, ctx }) => {
  const session = ctx.session;
  if (!session) throw new AppError('UNAUTHENTICATED');

  await rateLimit('auth.mfa.recovery', session.userId);

  const accepted = await consumeRecoveryCode(session.userId, body.code);
  if (!accepted) throw new AppError('VALIDATION_FAILED', 'That code did not work');

  const remaining = await countRemainingRecoveryCodes(session.userId);
  await resetTotp(session.userId);

  const token = await completeMfa(session.sessionId);
  (await cookies()).set(sessionCookieName(), token, sessionCookieOptions(session.expiresAt));

  const brand = await resolveBrand({ tenantId: session.tenantId });
  const supportEmail = ((await getSetting('support.email', { tenantId: session.tenantId })) as string) || 'support@mixweek.app';
  const notice = renderSecurityNotice(
    brand,
    'A recovery code was used on your account',
    'Two-factor authentication has been reset. Set up your authenticator again from Profile → Security.',
    supportEmail,
  );
  await sendMail({ to: session.user.email, tenantId: session.tenantId, ...notice });

  await auditLog({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorEmail: session.user.email,
    action: 'auth.recovery_used',
    diff: { remaining },
    ip: ctx.ip,
  });

  return { ok: true, mfaReset: true, remainingCodes: remaining };
});

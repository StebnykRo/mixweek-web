import { cookies } from 'next/headers';
import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { MfaConfirmSchema } from '@/modules/auth/schemas';
import { confirmTotpSetup, generateRecoveryCodes } from '@/modules/auth/totp';
import { completeMfa, sessionCookieName, sessionCookieOptions } from '@/modules/auth';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/mfa/confirm — activates TOTP and issues recovery codes. */
export const POST = route({ auth: { mode: 'public' }, body: MfaConfirmSchema, personal: true }, async ({ body, ctx }) => {
  const session = ctx.session;
  if (!session) throw new AppError('UNAUTHENTICATED');
  await rateLimit('auth.mfa.verify', session.userId);

  const confirmed = await confirmTotpSetup(session.userId, body.factorId, body.code);
  if (!confirmed) throw new AppError('VALIDATION_FAILED', 'That code did not work');

  const recoveryCodes = await generateRecoveryCodes(session.userId);

  // The session token rotates as soon as the second factor is satisfied.
  const token = await completeMfa(session.sessionId);
  (await cookies()).set(sessionCookieName(), token, sessionCookieOptions(session.expiresAt));

  await auditLog({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorEmail: session.user.email,
    action: 'auth.mfa_enabled',
    ip: ctx.ip,
  });

  return { ok: true, recoveryCodes };
});

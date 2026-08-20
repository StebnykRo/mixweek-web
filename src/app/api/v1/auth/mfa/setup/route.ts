import { route } from '@/lib/http/handler';
import { auditLog } from '@/lib/audit';
import { beginTotpSetup } from '@/modules/auth/totp';
import { qrSvg } from '@/lib/qr';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/mfa/setup — starts TOTP enrolment.
 *
 * Reachable with mfaSatisfied = false, because a person forced to enrol has no
 * second factor yet. The session stays half-authenticated until /mfa/confirm.
 */
export const POST = route({ auth: { mode: 'public' }, personal: true }, async ({ ctx }) => {
  const session = ctx.session;
  if (!session) return { error: 'UNAUTHENTICATED' };

  const setup = await beginTotpSetup(session.userId, session.user.email);

  await auditLog({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorEmail: session.user.email,
    action: 'auth.mfa_setup_start',
    ip: ctx.ip,
  });

  return {
    factorId: setup.factorId,
    otpauthUrl: setup.otpauthUrl,
    // Shown so the key can be typed into an authenticator by hand.
    secret: setup.secret,
    qrSvg: qrSvg(setup.otpauthUrl),
  };
});

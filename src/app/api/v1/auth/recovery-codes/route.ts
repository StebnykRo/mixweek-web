import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { stepUpSatisfied } from '@/modules/auth/policies';
import { generateRecoveryCodes } from '@/modules/auth/totp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/auth/recovery-codes — regenerates the ten codes.
 *
 * docs/03-auth.md §5 lists this as a step-up action: a second factor confirmed
 * within the last 15 minutes is required, and the check is here on the server
 * rather than in the dialog that asks for it.
 */
export const POST = route({ auth: { mode: 'session' }, limit: 'api.authenticated', personal: true }, async ({ session, ctx }) => {
  if (!stepUpSatisfied(session)) throw new AppError('STEP_UP_REQUIRED');

  const recoveryCodes = await generateRecoveryCodes(session.userId);

  await auditLog({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorEmail: session.user.email,
    action: 'auth.recovery_codes_regenerated',
    ip: ctx.ip,
  });

  return { recoveryCodes };
});

import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { globalDb } from '@/lib/db/client';
import { revokeSession } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.string().min(10).max(40) });

/** DELETE /api/v1/auth/sessions/{id} — ends one device's session. */
export const DELETE = route({ auth: { mode: 'session' }, personal: true }, async ({ params, session, ctx }) => {
  const { id } = ParamsSchema.parse(params);

  // Ownership is checked before anything is revoked: a session id belonging to
  // another account must look like it does not exist.
  const target = await globalDb.session.findFirst({
    where: { id, userId: session.userId },
    select: { id: true },
  });
  if (!target) throw notFound({ id });

  await revokeSession(target.id, 'user_revoked');
  await auditLog({
    tenantId: session.tenantId,
    actorId: session.userId,
    actorEmail: session.user.email,
    action: 'auth.session_revoke',
    entityType: 'Session',
    entityId: target.id,
    ip: ctx.ip,
  });

  return { ok: true };
});

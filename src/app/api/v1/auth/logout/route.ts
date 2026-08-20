import { cookies } from 'next/headers';
import { route } from '@/lib/http/handler';
import { auditLog } from '@/lib/audit';
import { LogoutSchema } from '@/modules/auth/schemas';
import { revokeAllSessions, revokeSession } from '@/modules/auth/session';
import { clearAuthCookies } from '@/lib/http/cookies';

export const dynamic = 'force-dynamic';

/** POST /api/v1/auth/logout — invalidates in the database, then clears cookies. */
export const POST = route(
  { auth: { mode: 'session' }, body: LogoutSchema, personal: true },
  async ({ body, ctx, session }) => {
    if (body.allDevices) {
      await revokeAllSessions(session.userId, 'user_logout_all');
    } else {
      await revokeSession(session.sessionId, 'user_logout');
    }

    const jar = await cookies();
    clearAuthCookies(jar, { allDevices: body.allDevices });

    await auditLog({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      action: body.allDevices ? 'auth.logout_all' : 'auth.logout',
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return { ok: true };
  },
);

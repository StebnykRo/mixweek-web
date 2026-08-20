import { route } from '@/lib/http/handler';
import { globalDb } from '@/lib/db/client';
import { auditLog } from '@/lib/audit';
import { ProfilePatchSchema } from '@/modules/auth/schemas';

export const dynamic = 'force-dynamic';

/** GET /api/v1/me */
export const GET = route({ auth: { mode: 'session' }, limit: 'api.authenticated', personal: true }, async ({ session }) => ({
  id: session.user.id,
  email: session.user.email,
  name: session.user.name,
  jobTitle: session.user.jobTitle,
  department: session.user.department,
  team: session.user.team,
  locale: session.user.locale,
  avatarUrl: session.user.avatarUrl,
  role: session.role,
}));

/** PATCH /api/v1/me — the fields a person may correct themselves. */
export const PATCH = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', body: ProfilePatchSchema, personal: true, mutates: true },
  async ({ body, session, ctx }) => {
    const updated = await globalDb.user.update({
      where: { id: session.userId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.jobTitle !== undefined ? { jobTitle: body.jobTitle } : {}),
        ...(body.department !== undefined ? { department: body.department } : {}),
        ...(body.team !== undefined ? { team: body.team } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
      },
      select: { id: true, name: true, jobTitle: true, department: true, team: true, locale: true },
    });

    await auditLog({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      action: 'profile.update',
      entityType: 'User',
      entityId: session.userId,
      diff: { fields: Object.keys(body) },
      ip: ctx.ip,
    });

    return updated;
  },
);

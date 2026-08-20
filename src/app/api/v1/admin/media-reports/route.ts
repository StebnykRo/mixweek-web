import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/** docs/10-admin.md §3.12b — the queue of complaints about external galleries. */
export const GET = route(
  { auth: { mode: 'permission', action: 'media_report:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => ({
    items: await withTenant(session.tenantId as string, (db) =>
      db.mediaReport.findMany({
        where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, mediaLinkId: true, reason: true, comment: true, status: true, createdAt: true },
      }),
    ),
  }),
);

const BodySchema = z.strictObject({
  id: z.string().min(10).max(40),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED']),
  hideMedia: z.boolean().optional(),
});

export const PATCH = route(
  {
    auth: { mode: 'permission', action: 'media_report:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    const tenantId = session.tenantId as string;

    await withTenant(tenantId, async (db) => {
      const report = await db.mediaReport.update({
        where: { id: body.id },
        data: {
          status: body.status,
          ...(body.status === 'RESOLVED' || body.status === 'DISMISSED'
            ? { resolvedBy: session.userId, resolvedAt: new Date() }
            : {}),
        },
        select: { mediaLinkId: true },
      });
      // Hiding the card is the one action we can take on somebody else's
      // gallery; the content itself is out of our hands (docs/08 §7).
      if (body.hideMedia) {
        await db.mediaLink.updateMany({ where: { id: report.mediaLinkId }, data: { status: 'HIDDEN' } });
      }
    });

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'media_report.update',
      entityType: 'MediaReport',
      entityId: body.id,
      diff: { status: body.status, hidden: body.hideMedia ?? false },
      ip: ctx.ip,
    });

    return { ok: true };
  },
);

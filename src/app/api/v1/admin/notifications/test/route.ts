import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { enqueueNotification } from '@/modules/notifications/dispatch';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({
  eventId: z.string().max(40).nullable().optional(),
  kind: z.enum(['ANNOUNCEMENT', 'REMINDER', 'PROGRAMME_UPDATE', 'MEDIA_READY', 'MERCH']),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  linkUrl: z.string().max(500).nullable().optional(),
  channels: z.array(z.enum(['push', 'email', 'inapp'])).min(1).max(3),
});

/**
 * POST /api/v1/admin/notifications/test
 *
 * docs/10-admin.md §3.7 — sending a test to yourself is mandatory before a
 * broadcast, so it gets its own endpoint: the recipient is the caller, taken
 * from the session, and cannot be anyone else.
 */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'notification:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session }) => {
    const tenantId = session.tenantId as string;

    const timezone = body.eventId
      ? ((
          await withTenant(tenantId, (db) =>
            db.event.findFirst({ where: { id: body.eventId as string }, select: { timezone: true } }),
          )
        )?.timezone ?? 'UTC')
      : 'UTC';

    const result = await enqueueNotification({
      tenantId,
      eventId: body.eventId ?? null,
      kind: body.kind,
      title: `[test] ${body.title}`,
      body: body.body,
      linkUrl: body.linkUrl ?? null,
      audience: { userIds: [session.userId] },
      channels: body.channels,
      timezone,
      actor: { userId: session.userId, email: session.user.email, role: session.role },
    });

    return { ok: true, notificationId: result.notificationId };
  },
);

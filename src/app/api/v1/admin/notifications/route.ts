import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { createNotification, resolveAudience } from '@/modules/notifications/service';

export const dynamic = 'force-dynamic';

const AudienceSchema = z.strictObject({
  roles: z.array(z.string().max(30)).max(10).optional(),
  departments: z.array(z.string().max(80)).max(100).optional(),
  teams: z.array(z.string().max(80)).max(100).optional(),
  registeredOnly: z.boolean().optional(),
  activityId: z.string().max(40).optional(),
  userIds: z.array(z.string().max(40)).max(1000).optional(),
});

const BodySchema = z.strictObject({
  eventId: z.string().max(40).nullable().optional(),
  kind: z.enum(['ANNOUNCEMENT', 'REMINDER', 'PROGRAMME_UPDATE', 'MEDIA_READY', 'MERCH', 'SCHEDULE_CHANGE']),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
  linkUrl: z.string().max(500).nullable().optional(),
  audience: AudienceSchema,
  channels: z.array(z.enum(['push', 'email', 'inapp'])).min(1).max(3),
  scheduledAt: z.coerce.date().nullable().optional(),
});

export const GET = route(
  { auth: { mode: 'permission', action: 'notification:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => ({
    items: await withTenant(session.tenantId as string, (db) =>
      db.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          kind: true,
          title: true,
          status: true,
          channels: true,
          scheduledAt: true,
          sentAt: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
      }),
    ),
  }),
);

/** POST creates a draft and reports the estimated reach (docs/10 §3.7). */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'notification:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session }) =>
    createNotification({
      tenantId: session.tenantId as string,
      eventId: body.eventId ?? null,
      kind: body.kind,
      title: body.title,
      body: body.body,
      linkUrl: body.linkUrl ?? null,
      audience: body.audience,
      channels: body.channels,
      scheduledAt: body.scheduledAt ?? null,
      actor: { userId: session.userId, email: session.user.email, role: session.role },
    }),
);

const EstimateSchema = z.strictObject({
  eventId: z.string().max(40).nullable().optional(),
  audience: AudienceSchema,
});

/** PUT is the reach estimate shown before sending — it writes nothing. */
export const PUT = route(
  {
    auth: { mode: 'permission', action: 'notification:read' },
    limit: 'admin.mutation',
    body: EstimateSchema,
    personal: true,
  },
  async ({ body, session }) => {
    const recipients = await resolveAudience(session.tenantId as string, body.eventId ?? null, body.audience);
    const pushCapable = await withTenant(session.tenantId as string, (db) =>
      db.pushSubscription.groupBy({
        by: ['userId'],
        where: { userId: { in: recipients }, isValid: true },
      }),
    );
    return { recipients: recipients.length, reachablePush: pushCapable.length, reachableEmail: recipients.length };
  },
);

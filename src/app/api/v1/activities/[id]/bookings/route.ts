import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { CuidSchema } from '@/modules/events/schemas';
import { bookActivity, cancelBooking } from '@/modules/registrations/bookings';
import { enqueueNotification } from '@/modules/notifications/dispatch';

export const dynamic = 'force-dynamic';

/** POST /api/v1/activities/{id}/bookings — reserve a seat on one session. */
export const POST = route(
  {
    auth: { mode: 'session' },
    limit: 'api.authenticated',
    idempotent: true,
    personal: true,
    mutates: true,
  },
  async ({ params, session, ctx }) =>
    bookActivity({
      tenantId: session.tenantId as string,
      activityId: CuidSchema.parse(params.id),
      userId: session.userId,
      actorEmail: session.user.email,
      ip: ctx.ip,
      requestId: ctx.requestId,
    }),
);

/** DELETE — releases the seat and promotes whoever is next. */
export const DELETE = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true, mutates: true },
  async ({ params, session, ctx }) => {
    const tenantId = session.tenantId as string;
    const activityId = CuidSchema.parse(params.id);

    const result = await cancelBooking({
      tenantId,
      activityId,
      userId: session.userId,
      actorEmail: session.user.email,
      ip: ctx.ip,
    });

    if (result.promotedUserId) {
      const activity = await withTenant(tenantId, (db) =>
        db.activity.findFirst({
          where: { id: activityId },
          select: { title: true, event: { select: { slug: true, timezone: true, id: true } } },
        }),
      );
      if (activity) {
        await enqueueNotification({
          tenantId,
          eventId: activity.event.id,
          kind: 'REGISTRATION',
          title: 'A place has opened up',
          body: `${activity.title}: you are off the waiting list.`,
          linkUrl: `/events/${activity.event.slug}/programme/${activityId}`,
          audience: { userIds: [result.promotedUserId] },
          channels: ['inapp', 'push', 'email'],
          timezone: activity.event.timezone,
        });
      }
    }

    return { ok: true };
  },
);

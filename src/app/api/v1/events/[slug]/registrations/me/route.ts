import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { SlugSchema } from '@/modules/events/schemas';
import { cancelRegistration, getMyRegistration } from '@/modules/registrations/service';
import { enqueueNotification } from '@/modules/notifications/dispatch';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/registrations/me */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    const registration = await getMyRegistration(tenantId, event.id, session.userId);
    return { registration };
  },
);

/** DELETE — cancelling frees the place and promotes the next person in line. */
export const DELETE = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true, mutates: true },
  async ({ params, session, ctx }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);

    const result = await cancelRegistration({
      tenantId,
      eventId: event.id,
      userId: session.userId,
      actorEmail: session.user.email,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    if (result.promotedUserId) {
      await enqueueNotification({
        tenantId,
        eventId: event.id,
        kind: 'REGISTRATION',
        title: 'A place has opened up',
        body: `${event.title}: you are off the waiting list and your place is confirmed.`,
        linkUrl: `/events/${event.slug}`,
        audience: { userIds: [result.promotedUserId] },
        channels: ['inapp', 'push', 'email'],
        timezone: event.timezone,
      });
    }

    return { ok: true };
  },
);

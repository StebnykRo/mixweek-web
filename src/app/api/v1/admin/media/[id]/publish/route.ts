import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { CuidSchema } from '@/modules/events/schemas';
import { publishMediaLink } from '@/modules/media/service';
import { enqueueNotification } from '@/modules/notifications/dispatch';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({ notify: z.boolean().default(false) });

/**
 * POST /api/v1/admin/media/{id}/publish
 *
 * docs/08 §6 — publishing plus one button that tells the people who were
 * actually at the event that the photos are ready.
 */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'media:publish' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) => {
    const tenantId = session.tenantId as string;
    const media = await publishMediaLink(tenantId, CuidSchema.parse(params.id), {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    });

    if (body.notify) {
      const event = await withTenant(tenantId, (db) =>
        db.event.findFirst({ where: { id: media.eventId }, select: { slug: true, title: true, timezone: true } }),
      );
      if (event) {
        await enqueueNotification({
          tenantId,
          eventId: media.eventId,
          kind: 'MEDIA_READY',
          title: `Photos from ${event.title} are ready`,
          body: media.title,
          linkUrl: `/events/${event.slug}/media`,
          audience: { registeredOnly: true },
          channels: ['inapp', 'push', 'email'],
          timezone: event.timezone,
          actor: { userId: session.userId, email: session.user.email, role: session.role },
        });
      }
    }

    return { ok: true, id: media.id };
  },
);

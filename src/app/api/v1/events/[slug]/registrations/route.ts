import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { SlugSchema } from '@/modules/events/schemas';
import { registerForEvent } from '@/modules/registrations/service';
import { enqueueNotification } from '@/modules/notifications/dispatch';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({
  answers: z.record(z.unknown()).optional(),
  photoConsent: z.boolean().optional(),
});

/**
 * POST /api/v1/events/{slug}/registrations
 *
 * Idempotency-Key is mandatory (docs/09 §1): a double submit from a flaky
 * mobile connection must not create two registrations.
 */
export const POST = route(
  {
    auth: { mode: 'session' },
    limit: 'api.authenticated',
    body: BodySchema,
    idempotent: true,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session, ctx }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);

    const result = await registerForEvent({
      tenantId,
      eventId: event.id,
      userId: session.userId,
      answers: body.answers ?? {},
      actorEmail: session.user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    await enqueueNotification({
      tenantId,
      eventId: event.id,
      kind: 'REGISTRATION',
      title: result.status === 'WAITLISTED' ? 'You are on the waiting list' : 'Registration confirmed',
      body:
        result.status === 'WAITLISTED'
          ? `${event.title}: you are number ${result.waitlistPosition} in line. We will let you know when a place opens up.`
          : `${event.title}: your place is confirmed.`,
      linkUrl: `/events/${event.slug}`,
      audience: { userIds: [session.userId] },
      channels: ['inapp', 'push', 'email'],
      timezone: event.timezone,
    });

    return {
      status: result.status,
      waitlistPosition: result.waitlistPosition,
      // The offline fallback code is returned once, at registration time.
      offlineCheckInCode: result.checkInCode,
    };
  },
);

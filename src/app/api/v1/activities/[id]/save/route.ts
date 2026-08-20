import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { setSaved } from '@/modules/registrations/bookings';

export const dynamic = 'force-dynamic';

/**
 * PUT / DELETE /api/v1/activities/{id}/save — the "♥".
 *
 * Deliberately cheap and idempotent: the client applies it optimistically and
 * the offline queue may replay it (docs/13 §4).
 */
export const PUT = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true, mutates: true },
  async ({ params, session }) =>
    setSaved({
      tenantId: session.tenantId as string,
      activityId: CuidSchema.parse(params.id),
      userId: session.userId,
      saved: true,
    }),
);

export const DELETE = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true, mutates: true },
  async ({ params, session }) =>
    setSaved({
      tenantId: session.tenantId as string,
      activityId: CuidSchema.parse(params.id),
      userId: session.userId,
      saved: false,
    }),
);

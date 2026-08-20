import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { SlugSchema } from '@/modules/events/schemas';
import { getMySchedule } from '@/modules/registrations/bookings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{slug}/my-schedule
 *
 * The personal layer only: three id lists the client overlays on the cached
 * programme. Keeping it this small is what lets the programme itself be shared.
 */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    return getMySchedule(tenantId, event.id, session.userId);
  },
);

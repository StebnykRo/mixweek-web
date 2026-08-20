import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { CuidSchema, SlugSchema } from '@/modules/events/schemas';
import { getActivity } from '@/modules/programme/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/activities/{id} */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: false },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const activityId = CuidSchema.parse(params.id);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    return getActivity(tenantId, event.id, activityId);
  },
);

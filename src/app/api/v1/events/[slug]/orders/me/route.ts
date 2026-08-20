import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { SlugSchema } from '@/modules/events/schemas';
import { getMyOrder } from '@/modules/merch/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/orders/me */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    return { order: await getMyOrder(tenantId, event.id, session.userId) };
  },
);

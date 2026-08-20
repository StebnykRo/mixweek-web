import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { SlugSchema } from '@/modules/events/schemas';
import { listPublishedMedia } from '@/modules/media/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/media — published link cards, grouped by kind. */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: false },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    return listPublishedMedia(tenantId, event.id);
  },
);

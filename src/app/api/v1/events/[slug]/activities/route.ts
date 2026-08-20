import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { ProgrammeQuerySchema, SlugSchema } from '@/modules/events/schemas';
import { getProgramme, type ProgrammeResult } from '@/modules/programme/service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{slug}/activities
 *
 * The shared programme payload: no personal data, so it carries an ETag and can
 * be revalidated cheaply (docs/09 §7). The personal layer (♥, bookings) is a
 * separate request the client overlays — mixing them would make this uncacheable.
 */
export const GET = route(
  {
    auth: { mode: 'session' },
    limit: 'api.authenticated',
    query: ProgrammeQuerySchema,
    personal: false,
    cacheControl: 'private, max-age=0, must-revalidate',
    etagOf: (result) => (result as ProgrammeResult).etag,
  },
  async ({ params, query, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    return getProgramme(tenantId, event.id, event.timezone, query);
  },
);

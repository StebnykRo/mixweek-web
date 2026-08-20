import { route } from '@/lib/http/handler';
import { viewerOf } from '@/lib/http/viewer';
import { EventListQuerySchema } from '@/modules/events/schemas';
import { listEvents } from '@/modules/events/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events?scope=upcoming|past|mine — cursor paginated (docs/09 §3). */
export const GET = route(
  {
    auth: { mode: 'session' },
    limit: 'api.authenticated',
    query: EventListQuerySchema,
    personal: true,
  },
  async ({ query, session }) => {
    return listEvents({
      viewer: viewerOf(session),
      email: session.user.email,
      scope: query.scope,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
      year: query.year,
      city: query.city,
    });
  },
);

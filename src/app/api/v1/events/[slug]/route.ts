import { route } from '@/lib/http/handler';
import { viewerOf } from '@/lib/http/viewer';
import { SlugSchema } from '@/modules/events/schemas';
import { getEventForViewer } from '@/modules/events/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug} — detail plus phase, my registration and serverTime. */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    return getEventForViewer(slug, viewerOf(session), session.user.email);
  },
);

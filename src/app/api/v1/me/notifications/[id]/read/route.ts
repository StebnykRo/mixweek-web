import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { markRead } from '@/modules/notifications/service';

export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({ id: z.union([z.literal('all'), z.string().min(10).max(40)]) });

/** POST /api/v1/me/notifications/{id}/read — or "all" to clear the badge. */
export const POST = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true, mutates: true },
  async ({ params, session }) => {
    const { id } = ParamsSchema.parse(params);
    const count = await markRead(session.tenantId as string, session.userId, id === 'all' ? 'all' : id);
    return { ok: true, marked: count };
  },
);

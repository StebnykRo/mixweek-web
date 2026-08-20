import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { listInbox } from '@/modules/notifications/service';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /api/v1/me/notifications — the in-app history (docs/07 §14a). */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', query: QuerySchema, personal: true },
  async ({ query, session }) =>
    listInbox(session.tenantId as string, session.userId, { cursor: query.cursor, limit: query.limit }),
);

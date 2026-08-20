import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { getInsights } from '@/modules/analytics/service';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  eventId: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** docs/10-admin.md §3.12a — aggregates only, with a minimum group size of 5. */
export const GET = route(
  { auth: { mode: 'permission', action: 'analytics:read' }, limit: 'admin.mutation', query: QuerySchema, personal: true },
  async ({ query, session }) =>
    getInsights(session.tenantId as string, query.eventId ?? null, {
      from: query.from ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      to: query.to ?? new Date(),
    }),
);

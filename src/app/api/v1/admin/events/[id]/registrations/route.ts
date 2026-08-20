import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { bulkUpdate, listRegistrations, registrationSummary } from '@/modules/admin/registrations';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'WAITLISTED', 'DECLINED', 'CANCELLED', 'ATTENDED', 'NO_SHOW']).optional(),
  department: z.string().max(80).optional(),
  q: z.string().max(80).optional(),
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = route(
  { auth: { mode: 'permission', action: 'registration:read' }, limit: 'admin.mutation', query: QuerySchema, personal: true },
  async ({ params, query, session }) => {
    const tenantId = session.tenantId as string;
    const eventId = CuidSchema.parse(params.id);
    const [page, summary] = await Promise.all([
      listRegistrations(tenantId, eventId, query),
      registrationSummary(tenantId, eventId),
    ]);
    return { ...page, summary };
  },
);

const BulkSchema = z.strictObject({
  action: z.enum(['approve', 'decline', 'promote']),
  registrationIds: z.array(CuidSchema).min(1).max(500),
});

export const PATCH = route(
  {
    auth: { mode: 'permission', action: 'registration:write' },
    limit: 'admin.mutation',
    body: BulkSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) =>
    bulkUpdate(session.tenantId as string, CuidSchema.parse(params.id), body.registrationIds, body.action, {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    }),
);

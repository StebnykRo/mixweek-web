import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { ActivityInputSchema, CuidSchema } from '@/modules/events/schemas';
import { createActivity, findPlaceConflicts } from '@/modules/admin/programme';

export const dynamic = 'force-dynamic';

export const GET = route(
  { auth: { mode: 'permission', action: 'programme:read' }, limit: 'admin.mutation', personal: true },
  async ({ params, session }) => {
    const tenantId = session.tenantId as string;
    const eventId = CuidSchema.parse(params.id);
    const [items, conflicts] = await Promise.all([
      withTenant(tenantId, (db) =>
        db.activity.findMany({
          where: { eventId, deletedAt: null },
          orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
          select: {
            id: true,
            title: true,
            track: true,
            startsAt: true,
            endsAt: true,
            status: true,
            isFeatured: true,
            bookingRequired: true,
            capacity: true,
            announcedAt: true,
            place: { select: { id: true, name: true } },
          },
        }),
      ),
      findPlaceConflicts(tenantId, eventId),
    ]);
    return { items, conflicts, unannounced: items.filter((item) => item.announcedAt === null).length };
  },
);

export const POST = route(
  {
    auth: { mode: 'permission', action: 'programme:write' },
    limit: 'admin.mutation',
    body: ActivityInputSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) =>
    createActivity(session.tenantId as string, CuidSchema.parse(params.id), body, {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    }),
);

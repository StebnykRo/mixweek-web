import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { SlugSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/announcements — only those inside their window. */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: false },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    const now = new Date();

    const items = await withTenant(tenantId, (db) =>
      db.announcement.findMany({
        where: {
          eventId: event.id,
          isPublished: true,
          deletedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ],
        },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, title: true, body: true, severity: true, linkUrl: true, isPinned: true, createdAt: true },
      }),
    );

    return { items, serverTime: now.toISOString() };
  },
);

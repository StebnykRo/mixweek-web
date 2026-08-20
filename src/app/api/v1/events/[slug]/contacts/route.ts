import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { SlugSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/contacts — Help. Must work offline (docs/07 §14). */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: false },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);

    const contacts = await withTenant(tenantId, (db) =>
      db.contact.findMany({
        where: { eventId: event.id, deletedAt: null },
        orderBy: [{ isUrgent: 'desc' }, { sortOrder: 'asc' }],
        select: { id: true, kind: true, name: true, role: true, email: true, phone: true, note: true, isUrgent: true },
      }),
    );

    return { items: contacts };
  },
);

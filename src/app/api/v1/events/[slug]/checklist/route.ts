import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { SlugSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/checklist — items plus this person's ticks. */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);

    const [items, states] = await withTenant(tenantId, (db) =>
      Promise.all([
        db.checklistItem.findMany({
          where: { eventId: event.id, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, label: true },
        }),
        db.checklistState.findMany({
          where: { userId: session.userId, item: { eventId: event.id } },
          select: { itemId: true, checked: true },
        }),
      ]),
    );

    const checked = new Set(states.filter((s) => s.checked).map((s) => s.itemId));
    return {
      items: items.map((item) => ({ ...item, checked: checked.has(item.id) })),
      done: items.filter((item) => checked.has(item.id)).length,
      total: items.length,
    };
  },
);

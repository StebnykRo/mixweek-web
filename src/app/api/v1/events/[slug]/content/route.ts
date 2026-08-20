import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { SlugSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  section: z.enum(['EVENT_STYLE', 'TRAVEL', 'HELP', 'FAQ', 'RULES', 'ONBOARDING']).optional(),
});

/** GET /api/v1/events/{slug}/content?section= — EventStyle, Travel, Help, FAQ. */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', query: QuerySchema, personal: false },
  async ({ params, query, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);

    const blocks = await withTenant(tenantId, (db) =>
      db.contentBlock.findMany({
        where: {
          eventId: event.id,
          isPublished: true,
          deletedAt: null,
          ...(query.section ? { section: query.section } : {}),
        },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
        select: { id: true, section: true, key: true, title: true, body: true, icon: true, imageUrl: true },
      }),
    );

    return { items: blocks };
  },
);

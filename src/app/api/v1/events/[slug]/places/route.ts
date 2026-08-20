import { createHash } from 'node:crypto';
import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { SlugSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

/** GET /api/v1/events/{slug}/places — map pins, cacheable and offline-friendly. */
export const GET = route(
  {
    auth: { mode: 'session' },
    limit: 'api.authenticated',
    personal: false,
    cacheControl: 'private, max-age=0, must-revalidate',
    etagOf: (result) =>
      `W/"${createHash('sha1').update(JSON.stringify(result)).digest('base64url').slice(0, 27)}"`,
  },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);

    const places = await withTenant(tenantId, (db) =>
      db.place.findMany({
        where: { eventId: event.id, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          kind: true,
          description: true,
          mapX: true,
          mapY: true,
          lat: true,
          lng: true,
          address: true,
          openingHours: true,
          imageUrl: true,
        },
      }),
    );

    return { items: places };
  },
);

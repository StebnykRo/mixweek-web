import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { CuidSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

const PlaceSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['STAGE', 'WORKSHOP', 'CARE', 'MERCH', 'HOTEL', 'RESTAURANT', 'TRANSFER', 'IT_ZONE', 'OTHER']),
  description: z.string().max(2000).nullable().optional(),
  /** Percentage coordinates on the uploaded floor plan (docs/07 §9). */
  mapX: z.number().min(0).max(100).nullable().optional(),
  mapY: z.number().min(0).max(100).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  openingHours: z.string().max(80).nullable().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const GET = route(
  { auth: { mode: 'permission', action: 'place:read' }, limit: 'admin.mutation', personal: true },
  async ({ params, session }) => ({
    items: await withTenant(session.tenantId as string, (db) =>
      db.place.findMany({
        where: { eventId: CuidSchema.parse(params.id), deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      }),
    ),
  }),
);

export const POST = route(
  {
    auth: { mode: 'permission', action: 'place:write' },
    limit: 'admin.mutation',
    body: PlaceSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) => {
    const tenantId = session.tenantId as string;
    const eventId = CuidSchema.parse(params.id);

    const place = await withTenant(tenantId, (db, scopedTenantId) =>
      db.place.create({
        data: {
          tenantId: scopedTenantId,
          eventId,
          name: body.name,
          kind: body.kind,
          description: body.description ?? null,
          mapX: body.mapX ?? null,
          mapY: body.mapY ?? null,
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          address: body.address ?? null,
          openingHours: body.openingHours ?? null,
          imageUrl: body.imageUrl ?? null,
          sortOrder: body.sortOrder,
        },
        select: { id: true, name: true },
      }),
    );

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'place.create',
      entityType: 'Place',
      entityId: place.id,
    });

    return place;
  },
);

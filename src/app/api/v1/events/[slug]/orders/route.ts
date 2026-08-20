import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { CuidSchema, SlugSchema } from '@/modules/events/schemas';
import { reserveOrder } from '@/modules/merch/service';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({
  items: z
    .array(z.strictObject({ variantId: CuidSchema, quantity: z.number().int().min(1).max(10) }))
    .min(1)
    .max(10),
});

/** POST /api/v1/events/{slug}/orders — transactional reservation, no payment. */
export const POST = route(
  {
    auth: { mode: 'session' },
    limit: 'api.authenticated',
    body: BodySchema,
    idempotent: true,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);

    const order = await reserveOrder({
      tenantId,
      eventId: event.id,
      userId: session.userId,
      actorEmail: session.user.email,
      items: body.items,
    });

    // The pickup code is shown once; only its hash is kept.
    return { orderId: order.orderId, number: order.number, offlinePickupCode: order.pickupCode };
  },
);

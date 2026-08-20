import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { cancelOrder } from '@/modules/merch/service';

export const dynamic = 'force-dynamic';

/** DELETE /api/v1/orders/{id} — cancels a reservation and frees the stock. */
export const DELETE = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true, mutates: true },
  async ({ params, session }) => {
    await cancelOrder({
      tenantId: session.tenantId as string,
      orderId: CuidSchema.parse(params.id),
      userId: session.userId,
      actorEmail: session.user.email,
    });
    return { ok: true };
  },
);

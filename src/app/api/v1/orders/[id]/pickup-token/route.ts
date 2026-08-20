import { route } from '@/lib/http/handler';
import { qrSvg } from '@/lib/qr';
import { CuidSchema } from '@/modules/events/schemas';
import { issuePickupToken } from '@/modules/merch/service';

export const dynamic = 'force-dynamic';

/** GET /api/v1/orders/{id}/pickup-token — short-lived, same shape as check-in. */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ params, session }) => {
    const token = await issuePickupToken(
      session.tenantId as string,
      CuidSchema.parse(params.id),
      session.userId,
    );
    return {
      token: token.token,
      expiresAt: token.expiresAt,
      ttlSeconds: token.ttlSeconds,
      qrSvg: qrSvg(token.token, { size: 220 }),
    };
  },
);

import { route } from '@/lib/http/handler';
import { requireEvent } from '@/lib/http/viewer';
import { SlugSchema } from '@/modules/events/schemas';
import { issueCheckInToken } from '@/modules/checkin/service';
import { qrSvg } from '@/lib/qr';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{slug}/check-in-token
 *
 * A 60-second signed token, refreshed by the screen every 30 s. Never cached,
 * never stored by the service worker (docs/13 §4).
 */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ params, session }) => {
    const slug = SlugSchema.parse(params.slug);
    const tenantId = session.tenantId as string;
    const event = await requireEvent(tenantId, slug);
    const token = await issueCheckInToken(tenantId, event.id, session.userId);
    return {
      token: token.token,
      expiresAt: token.expiresAt,
      ttlSeconds: token.ttlSeconds,
      qrSvg: qrSvg(token.token, { size: 220 }),
    };
  },
);

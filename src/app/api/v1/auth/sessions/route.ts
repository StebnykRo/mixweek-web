import { route } from '@/lib/http/handler';
import { listSessions } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

/** GET /api/v1/auth/sessions — the devices a person is signed in on. */
export const GET = route({ auth: { mode: 'session' }, personal: true }, async ({ session }) => {
  const sessions = await listSessions(session.userId);
  return {
    items: sessions.map((item) => ({
      id: item.id,
      deviceLabel: item.deviceLabel,
      // The raw user agent is never echoed back; the friendly label is enough.
      createdAt: item.createdAt,
      lastSeenAt: item.lastSeenAt,
      expiresAt: item.expiresAt,
      current: item.id === session.sessionId,
    })),
  };
});

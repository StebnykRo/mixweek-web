import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { getPreferences, setPreferences } from '@/modules/notifications/preferences';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({
  preferences: z
    .array(
      z.strictObject({
        kind: z.enum([
          'ANNOUNCEMENT',
          'REMINDER',
          'SCHEDULE_CHANGE',
          'PROGRAMME_UPDATE',
          'REGISTRATION',
          'MEDIA_READY',
          'MERCH',
          'SYSTEM',
        ]),
        channel: z.enum(['push', 'email']),
        enabled: z.boolean(),
      }),
    )
    .max(40),
});

/** GET / PUT /api/v1/me/notification-preferences (docs/07 §15). */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ session }) => ({ items: await getPreferences(session.tenantId as string, session.userId) }),
);

export const PUT = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', body: BodySchema, personal: true, mutates: true },
  async ({ body, session }) => {
    // Critical kinds are filtered out inside setPreferences — the API is not a
    // way around the locked switches in the UI.
    await setPreferences(session.tenantId as string, session.userId, body.preferences);
    return { items: await getPreferences(session.tenantId as string, session.userId) };
  },
);

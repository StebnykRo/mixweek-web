import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { subscribe, unsubscribe, getPublicVapidKey } from '@/modules/notifications/push';

export const dynamic = 'force-dynamic';

const SubscribeSchema = z.strictObject({
  endpoint: z.string().url().max(2000),
  keys: z.strictObject({ p256dh: z.string().max(255), auth: z.string().max(255) }),
});

const UnsubscribeSchema = z.strictObject({ endpoint: z.string().url().max(2000) });

/** GET — the public VAPID key the browser needs to subscribe. */
export const GET = route({ auth: { mode: 'session' }, limit: 'api.authenticated', personal: true }, async () => ({
  publicKey: await getPublicVapidKey(),
}));

/** POST — registers this device against the session's user and tenant only. */
export const POST = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', body: SubscribeSchema, personal: true, mutates: true },
  async ({ body, session, ctx }) => {
    const record = await subscribe({
      tenantId: session.tenantId as string,
      userId: session.userId,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: ctx.userAgent,
      locale: session.user.locale,
    });
    return { ok: true, id: record.id };
  },
);

export const DELETE = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', body: UnsubscribeSchema, personal: true, mutates: true },
  async ({ body, session }) => {
    await unsubscribe(session.tenantId as string, session.userId, body.endpoint);
    return { ok: true };
  },
);

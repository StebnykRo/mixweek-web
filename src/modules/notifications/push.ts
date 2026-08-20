import webpush from 'web-push';
import { getSecret, setSecret } from '@/lib/crypto/secrets';
import { withTenant } from '@/lib/db/tenant-client';
import { logger } from '@/lib/logger';
import { getSetting } from '@/modules/tenancy/settings';

/**
 * docs/11-notifications.md §9 — VAPID keys live in SecretSetting; the private
 * key never leaves the server. Payloads are encrypted by the Web Push protocol
 * itself (aes128gcm), which is a requirement of the standard, not an option.
 */

export const MAX_SUBSCRIPTIONS_PER_USER = 10;

export type VapidKeys = { publicKey: string; privateKey: string };

export async function getVapidKeys(): Promise<VapidKeys> {
  const [publicKey, privateKey] = await Promise.all([
    getSecret('push.vapid_public'),
    getSecret('push.vapid_private'),
  ]);
  if (publicKey && privateKey) return { publicKey, privateKey };

  // Bootstrap on first use so a fresh install can send a push without a manual
  // key-generation step. Rotation still happens through the admin.
  const generated = webpush.generateVAPIDKeys();
  await setSecret({}, 'push.vapid_public', generated.publicKey, { userId: null });
  await setSecret({}, 'push.vapid_private', generated.privateKey, { userId: null });
  return generated;
}

export async function getPublicVapidKey(): Promise<string> {
  return (await getVapidKeys()).publicKey;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string | null;
  badge?: string | null;
};

export type PushOutcome = 'sent' | 'expired' | 'failed';

export async function sendPush(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
  contactEmail: string,
): Promise<PushOutcome> {
  const keys = await getVapidKeys();
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: { subject: `mailto:${contactEmail}`, publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 60 * 60,
        urgency: 'normal',
      },
    );
    return 'sent';
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    // docs/11 §4.6 — 404/410 mean the subscription is dead; stop retrying it.
    if (statusCode === 404 || statusCode === 410) return 'expired';
    logger.warn({ status: statusCode ?? 0, kind: 'push' }, 'push-send-failed');
    return 'failed';
  }
}

export async function markSubscriptionInvalid(tenantId: string, subscriptionId: string): Promise<void> {
  await withTenant(tenantId, (db) =>
    db.pushSubscription.updateMany({ where: { id: subscriptionId }, data: { isValid: false } }),
  );
}

export type SubscribeInput = {
  tenantId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  locale?: string | null;
};

/**
 * docs/11 §9 — a subscription is always bound to the session's user and tenant,
 * so it is not possible to register a device against somebody else's account.
 */
export async function subscribe(input: SubscribeInput): Promise<{ id: string }> {
  return withTenant(input.tenantId, async (db, tenantId) => {
    const existing = await db.pushSubscription.findFirst({
      where: { endpoint: input.endpoint },
      select: { id: true, userId: true },
    });

    if (existing && existing.userId !== input.userId) {
      // The endpoint moved to another account on the same device: re-point it
      // rather than leaving a subscription that pushes to the wrong person.
      await db.pushSubscription.delete({ where: { id: existing.id } });
    }

    const record = await db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        tenantId,
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
        locale: input.locale ?? null,
      },
      update: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        isValid: true,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
      },
      select: { id: true },
    });

    // Cap the device list; the least recently successful entries drop off.
    const all = await db.pushSubscription.findMany({
      where: { userId: input.userId, isValid: true },
      orderBy: [{ lastSuccessAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });
    const excess = all.slice(MAX_SUBSCRIPTIONS_PER_USER).map((s) => s.id);
    if (excess.length) await db.pushSubscription.deleteMany({ where: { id: { in: excess } } });

    return record;
  });
}

export async function unsubscribe(tenantId: string, userId: string, endpoint: string): Promise<void> {
  await withTenant(tenantId, (db) =>
    db.pushSubscription.deleteMany({ where: { userId, endpoint } }),
  );
}

export async function supportContact(tenantId: string): Promise<string> {
  const email = (await getSetting('support.email', { tenantId })) as string;
  return email || 'support@mixweek.app';
}

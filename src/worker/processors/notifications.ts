import { withTenant } from '@/lib/db/tenant-client';
import { logger } from '@/lib/logger';
import { sendMail } from '@/lib/mail';
import { resolveBrand } from '@/modules/branding/service';
import { markSent, materialiseDeliveries, planDeliveries, truncateForPush } from '@/modules/notifications/service';
import { markSubscriptionInvalid, sendPush, supportContact } from '@/modules/notifications/push';
import { THROUGHPUT } from '@/modules/notifications/policy';
import { env } from '@/lib/env';

/**
 * docs/11-notifications.md §4 — the fan-out.
 *
 * Sending 3 000 pushes at once produces a traffic spike five seconds later and
 * risks being rate-limited by the push services, so deliveries are paced at
 * 200/s and non-urgent ones carry a jitter. Every step is keyed so a retry
 * cannot double-deliver.
 */
export type NotificationJob = { tenantId: string; notificationId: string; timezone: string };

export async function processNotification(job: NotificationJob): Promise<{ sent: number; skipped: number }> {
  const { tenantId, notificationId, timezone } = job;

  const plan = await planDeliveries(tenantId, notificationId, { timezone });
  await materialiseDeliveries(tenantId, notificationId, plan);

  const notification = await withTenant(tenantId, (db) =>
    db.notification.findFirst({
      where: { id: notificationId },
      select: { id: true, kind: true, title: true, body: true, linkUrl: true, eventId: true },
    }),
  );
  if (!notification) return { sent: 0, skipped: 0 };

  const queued = await withTenant(tenantId, (db) =>
    db.notificationDelivery.findMany({
      where: { notificationId, status: 'QUEUED' },
      select: { id: true, userId: true, channel: true },
    }),
  );

  const [brand, contact] = await Promise.all([resolveBrand({ tenantId }), supportContact(tenantId)]);

  let sent = 0;
  let skipped = 0;
  const perTick = Math.max(1, THROUGHPUT.messagesPerSecond);
  const started = Date.now();

  for (const [index, delivery] of queued.entries()) {
    // Pace the loop so the send rate stays inside the budget.
    const expectedElapsed = (index / perTick) * 1000;
    const actualElapsed = Date.now() - started;
    if (expectedElapsed > actualElapsed) await sleep(expectedElapsed - actualElapsed);

    if (delivery.channel === 'inapp') {
      await mark(tenantId, delivery.id, 'DELIVERED');
      sent += 1;
      continue;
    }

    if (delivery.channel === 'push') {
      const subscriptions = await withTenant(tenantId, (db) =>
        db.pushSubscription.findMany({
          where: { userId: delivery.userId, isValid: true },
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        }),
      );
      if (subscriptions.length === 0) {
        await mark(tenantId, delivery.id, 'SKIPPED', 'no push subscription');
        skipped += 1;
        continue;
      }

      const payload = truncateForPush(notification.title, notification.body);
      let anySent = false;
      for (const subscription of subscriptions) {
        const outcome = await sendPush(
          subscription,
          { ...payload, url: notification.linkUrl ?? '/', tag: notification.id, icon: brand.logoMarkUrl },
          contact,
        );
        // docs/11 §4.6 — 404/410 means the device is gone; stop trying it.
        if (outcome === 'expired') await markSubscriptionInvalid(tenantId, subscription.id);
        if (outcome === 'sent') anySent = true;
      }
      await mark(tenantId, delivery.id, anySent ? 'SENT' : 'FAILED');
      if (anySent) sent += 1;
      else skipped += 1;
      continue;
    }

    if (delivery.channel === 'email') {
      const record = await withTenant(tenantId, (db) =>
        db.notificationDelivery.findFirst({
          where: { id: delivery.id },
          select: { user: { select: { email: true, name: true } } },
        }),
      );
      if (!record?.user.email) {
        await mark(tenantId, delivery.id, 'SKIPPED', 'no address');
        skipped += 1;
        continue;
      }

      const html = renderNotificationEmail({
        appName: brand.appName,
        title: notification.title,
        body: notification.body,
        linkUrl: notification.linkUrl,
        primary: brand.tokens.colors.primary[600],
        ink: brand.tokens.colors.ink,
        surface: brand.tokens.colors.surface,
        bg: brand.tokens.colors.bg,
        settingsUrl: `${env().APP_URL}/profile/notifications`,
        reason: 'You are receiving this because you are taking part in this event.',
      });

      const result = await sendMail({
        to: record.user.email,
        tenantId,
        subject: `${brand.appName}: ${notification.title}`,
        html,
        text: `${notification.title}\n\n${notification.body}\n\n${notification.linkUrl ? `${env().APP_URL}${notification.linkUrl}` : ''}`,
      });
      await mark(tenantId, delivery.id, result.delivered ? 'SENT' : 'FAILED');
      if (result.delivered) sent += 1;
      else skipped += 1;
    }
  }

  await markSent(tenantId, notificationId);
  logger.info({ queue: 'notifications', jobId: notificationId, count: sent, tenantId }, 'notification-fanout-complete');

  return { sent, skipped };
}

async function mark(tenantId: string, deliveryId: string, status: string, error?: string): Promise<void> {
  await withTenant(tenantId, (db) =>
    db.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: status as never, sentAt: new Date(), error: error ?? null },
    }),
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** docs/11 §7 — one branded template, with the reason and a settings link. */
export function renderNotificationEmail(input: {
  appName: string;
  title: string;
  body: string;
  linkUrl: string | null;
  primary: string;
  ink: string;
  surface: string;
  bg: string;
  settingsUrl: string;
  reason: string;
}): string {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const href = input.linkUrl ? `${env().APP_URL}${input.linkUrl}` : env().APP_URL;

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:${input.bg};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${input.ink}">
  <span style="display:none;max-height:0;overflow:hidden">${escape(input.body.slice(0, 90))}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:${input.surface};border-radius:16px;padding:32px">
    <tr><td>
      <div style="font-size:18px;font-weight:700;margin-bottom:20px">${escape(input.appName)}</div>
      <h1 style="font-size:22px;margin:0 0 12px">${escape(input.title)}</h1>
      <p style="margin:0 0 24px;line-height:1.5">${escape(input.body)}</p>
      <p style="margin:0 0 24px"><a href="${escape(href)}" style="display:inline-block;background:${input.primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600">Open ${escape(input.appName)}</a></p>
      <p style="margin:0;font-size:12px;opacity:.7">${escape(input.reason)} <a href="${escape(input.settingsUrl)}" style="color:${input.primary}">Notification settings</a></p>
    </td></tr>
  </table>
</body></html>`;
}

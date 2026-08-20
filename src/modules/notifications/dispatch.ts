import type { NotificationKind } from '@prisma/client';
import { enqueue } from '@/lib/queue';
import { createNotification, type Audience } from './service';
import type { Channel } from './policy';

/**
 * The one entry point services use to send something. It creates the
 * Notification row, then hands the fan-out to the queue — the request never
 * waits for 3 000 deliveries.
 */
export type EnqueueInput = {
  tenantId: string;
  eventId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  linkUrl?: string | null;
  audience: Audience;
  channels: Channel[];
  timezone: string;
  scheduledAt?: Date | null;
  actor?: { userId: string; email: string; role: string | null } | null;
};

export async function enqueueNotification(input: EnqueueInput): Promise<{ notificationId: string; recipients: number }> {
  const created = await createNotification({
    tenantId: input.tenantId,
    eventId: input.eventId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    linkUrl: input.linkUrl ?? null,
    audience: input.audience,
    channels: input.channels,
    scheduledAt: input.scheduledAt ?? null,
    actor: input.actor ?? null,
  });

  await enqueue(
    'notifications',
    { tenantId: input.tenantId, notificationId: created.id, timezone: input.timezone },
    {
      // Deterministic: re-running the same send cannot double-deliver.
      jobId: `notification:${created.id}`,
      ...(input.scheduledAt ? { delaySeconds: Math.max(0, Math.round((input.scheduledAt.getTime() - Date.now()) / 1000)) } : {}),
    },
  );

  return { notificationId: created.id, recipients: created.estimatedRecipients };
}

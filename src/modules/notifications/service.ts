import type { NotificationKind, Prisma } from '@prisma/client';
import { withTenant } from '@/lib/db/tenant-client';
import { notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { kvIncr } from '@/lib/redis';
import { isQuietHour, nextQuietHourEnd } from '@/modules/events/time';
import { CRITICAL_KINDS, KIND_POLICY, PUSH_LIMITS, jitterFor, shouldDeliver, truncateForPush, type Channel } from './policy';

/**
 * docs/11-notifications.md §4 and §5 — composing an audience, materialising
 * deliveries, and the rules that stop 3 000 pushes from arriving at once.
 */

export type Audience = {
  roles?: string[];
  departments?: string[];
  teams?: string[];
  registeredOnly?: boolean;
  activityId?: string;
  userIds?: string[];
};

export async function resolveAudience(tenantId: string, eventId: string | null, audience: Audience): Promise<string[]> {
  return withTenant(tenantId, async (db) => {
    if (audience.userIds?.length) {
      const memberships = await db.membership.findMany({
        where: { userId: { in: audience.userIds }, status: 'ACTIVE' },
        select: { userId: true },
      });
      return memberships.map((m) => m.userId);
    }

    // "Whoever saved or booked this activity" — the only people a schedule
    // change actually concerns (docs/11 §5).
    if (audience.activityId) {
      const [saved, booked] = await Promise.all([
        db.savedActivity.findMany({ where: { activityId: audience.activityId }, select: { userId: true } }),
        db.activityBooking.findMany({
          where: { activityId: audience.activityId, status: { in: ['BOOKED', 'WAITLISTED'] } },
          select: { userId: true },
        }),
      ]);
      return [...new Set([...saved.map((s) => s.userId), ...booked.map((b) => b.userId)])];
    }

    if (audience.registeredOnly && eventId) {
      const registrations = await db.eventRegistration.findMany({
        where: { eventId, status: { in: ['CONFIRMED', 'PENDING', 'ATTENDED'] }, userId: { not: null } },
        select: { userId: true },
      });
      return registrations.map((r) => r.userId).filter((id): id is string => id !== null);
    }

    const where: Prisma.MembershipWhereInput = { status: 'ACTIVE' };
    if (audience.roles?.length) where.role = { in: audience.roles as never };
    const memberships = await db.membership.findMany({ where, select: { userId: true, user: { select: { department: true, team: true } } } });

    return memberships
      .filter((m) => {
        if (audience.departments?.length && !audience.departments.includes(m.user.department ?? '')) return false;
        if (audience.teams?.length && !audience.teams.includes(m.user.team ?? '')) return false;
        return true;
      })
      .map((m) => m.userId);
  });
}

export type CreateNotificationInput = {
  tenantId: string;
  eventId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  linkUrl?: string | null;
  audience: Audience;
  channels: Channel[];
  scheduledAt?: Date | null;
  actor?: { userId: string; email: string; role: string | null } | null;
};

export async function createNotification(input: CreateNotificationInput): Promise<{ id: string; estimatedRecipients: number }> {
  const recipients = await resolveAudience(input.tenantId, input.eventId, input.audience);

  const notification = await withTenant(input.tenantId, (db, tenantId) =>
    db.notification.create({
      data: {
        tenantId,
        eventId: input.eventId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl ?? null,
        audience: input.audience as Prisma.InputJsonValue,
        channels: input.channels,
        scheduledAt: input.scheduledAt ?? null,
        status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        createdBy: input.actor?.userId ?? null,
      },
      select: { id: true },
    }),
  );

  if (input.actor) {
    await auditLog({
      tenantId: input.tenantId,
      actorId: input.actor.userId,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      action: 'notification.create',
      entityType: 'Notification',
      entityId: notification.id,
      diff: { kind: input.kind, title: input.title, recipients: recipients.length, channels: input.channels },
    });
  }

  return { id: notification.id, estimatedRecipients: recipients.length };
}

export type PlannedDelivery = {
  userId: string;
  channel: Channel;
  delaySeconds: number;
};

/**
 * Turns a notification into a concrete delivery plan: who, on which channel,
 * and how long to wait. Preferences, per-user push caps and quiet hours are all
 * applied here rather than in the worker, so the plan is testable on its own.
 */
export async function planDeliveries(
  tenantId: string,
  notificationId: string,
  options: { timezone: string; now?: Date },
): Promise<PlannedDelivery[]> {
  const now = options.now ?? new Date();

  const notification = await withTenant(tenantId, (db) =>
    db.notification.findFirst({
      where: { id: notificationId },
      select: { id: true, kind: true, eventId: true, audience: true, channels: true },
    }),
  );
  if (!notification) throw notFound({ notificationId });

  const kind = notification.kind;
  const recipients = await resolveAudience(tenantId, notification.eventId, notification.audience as Audience);
  const channels = notification.channels.filter((c): c is Channel => c === 'push' || c === 'email' || c === 'inapp');

  const preferences = await withTenant(tenantId, (db) =>
    db.notificationPreference.findMany({
      where: { userId: { in: recipients }, kind },
      select: { userId: true, channel: true, enabled: true },
    }),
  );
  const prefIndex = new Map(preferences.map((p) => [`${p.userId}:${p.channel}`, { enabled: p.enabled }]));

  const urgent = KIND_POLICY[kind].urgent;
  const quiet = isQuietHour(now, options.timezone);
  const quietDelay = quiet && !urgent ? Math.max(0, Math.round((nextQuietHourEnd(now, options.timezone).getTime() - now.getTime()) / 1000)) : 0;

  const plan: PlannedDelivery[] = [];
  for (const [index, userId] of recipients.entries()) {
    for (const channel of channels) {
      if (!shouldDeliver(kind, channel, prefIndex.get(`${userId}:${channel}`))) continue;
      if (channel === 'push' && !urgent && !(await withinPushBudget(userId))) continue;
      plan.push({
        userId,
        channel,
        delaySeconds: channel === 'inapp' ? 0 : quietDelay + jitterFor(kind, index, recipients.length),
      });
    }
  }
  return plan;
}

/** docs/11 §4.7 — no more than 5 pushes an hour and 15 a day per person. */
export async function withinPushBudget(userId: string): Promise<boolean> {
  const hour = await kvIncr(`push:budget:h:${userId}:${Math.floor(Date.now() / 3_600_000)}`, 3600);
  if (hour.count > PUSH_LIMITS.perHour) return false;
  const day = await kvIncr(`push:budget:d:${userId}:${Math.floor(Date.now() / 86_400_000)}`, 86_400);
  return day.count <= PUSH_LIMITS.perDay;
}

/** Deliveries are keyed uniquely, so replaying a send creates no duplicates. */
export async function materialiseDeliveries(tenantId: string, notificationId: string, plan: PlannedDelivery[]): Promise<number> {
  if (plan.length === 0) return 0;
  return withTenant(tenantId, async (db, scopedTenantId) => {
    const result = await db.notificationDelivery.createMany({
      data: plan.map((entry) => ({
        tenantId: scopedTenantId,
        notificationId,
        userId: entry.userId,
        channel: entry.channel,
        status: 'QUEUED' as const,
      })),
      skipDuplicates: true,
    });
    return result.count;
  });
}

export async function markSent(tenantId: string, notificationId: string): Promise<void> {
  await withTenant(tenantId, (db) =>
    db.notification.updateMany({ where: { id: notificationId }, data: { status: 'SENT', sentAt: new Date() } }),
  );
}

export type InboxItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
};

/** docs/07 §14a — the in-app history: the one channel a person cannot miss. */
export async function listInbox(
  tenantId: string,
  userId: string,
  options: { cursor?: string; limit: number },
): Promise<{ items: InboxItem[]; nextCursor: string | null; unread: number }> {
  return withTenant(tenantId, async (db) => {
    const rows = await db.notificationDelivery.findMany({
      where: { userId, channel: 'inapp' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        readAt: true,
        createdAt: true,
        notification: { select: { kind: true, title: true, body: true, linkUrl: true } },
      },
    });

    const page = rows.slice(0, options.limit);
    const unread = await db.notificationDelivery.count({ where: { userId, channel: 'inapp', readAt: null } });

    return {
      items: page.map((row) => ({
        id: row.id,
        kind: row.notification.kind,
        title: row.notification.title,
        body: row.notification.body,
        linkUrl: row.notification.linkUrl,
        readAt: row.readAt,
        createdAt: row.createdAt,
      })),
      nextCursor: rows.length > options.limit ? (page[page.length - 1]?.id ?? null) : null,
      unread,
    };
  });
}

export async function markRead(tenantId: string, userId: string, deliveryId: string | 'all'): Promise<number> {
  return withTenant(tenantId, async (db) => {
    const result = await db.notificationDelivery.updateMany({
      where: { userId, channel: 'inapp', readAt: null, ...(deliveryId === 'all' ? {} : { id: deliveryId }) },
      data: { readAt: new Date() },
    });
    return result.count;
  });
}

export async function unreadCount(tenantId: string, userId: string): Promise<number> {
  return withTenant(tenantId, (db) =>
    db.notificationDelivery.count({ where: { userId, channel: 'inapp', readAt: null } }),
  );
}

export { CRITICAL_KINDS, truncateForPush };

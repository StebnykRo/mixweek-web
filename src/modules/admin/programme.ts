import type { Prisma } from '@prisma/client';
import { withTenant } from '@/lib/db/tenant-client';
import { notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { invalidateTenant } from '@/lib/cache';
import { enqueueNotification } from '@/modules/notifications/dispatch';
import { formatTimeInZone } from '@/modules/events/time';
import type { AdminActor } from './events';

/**
 * docs/10-admin.md §3.3 and docs/06 §7 — editing the programme.
 *
 * Moving or cancelling a published session notifies only the people who have it
 * in their own programme, never everyone. New sessions are batched instead
 * (docs/11 §5), because filling a programme is dozens of saves in a row.
 */

export type ActivityWrite = {
  title: string;
  description?: string | null;
  track: string;
  startsAt: Date;
  endsAt: Date;
  placeId?: string | null;
  locationText?: string | null;
  speakers?: unknown;
  bookingRequired: boolean;
  capacity?: number | null;
  waitlistEnabled: boolean;
  bookingOpensAt?: Date | null;
  bookingClosesAt?: Date | null;
  isFeatured: boolean;
  isMandatory: boolean;
  sortOrder: number;
};

export async function createActivity(tenantId: string, eventId: string, data: ActivityWrite, actor: AdminActor) {
  const activity = await withTenant(tenantId, (db, scopedTenantId) =>
    db.activity.create({
      data: {
        tenantId: scopedTenantId,
        eventId,
        title: data.title,
        description: data.description ?? null,
        track: data.track as never,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        placeId: data.placeId ?? null,
        locationText: data.locationText ?? null,
        speakers: (data.speakers ?? undefined) as Prisma.InputJsonValue | undefined,
        bookingRequired: data.bookingRequired,
        capacity: data.capacity ?? null,
        waitlistEnabled: data.waitlistEnabled,
        bookingOpensAt: data.bookingOpensAt ?? null,
        bookingClosesAt: data.bookingClosesAt ?? null,
        isFeatured: data.isFeatured,
        isMandatory: data.isMandatory,
        sortOrder: data.sortOrder,
      },
      select: { id: true, title: true },
    }),
  );

  await invalidateTenant(tenantId, 'programme');
  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'activity.create',
    entityType: 'Activity',
    entityId: activity.id,
    diff: { title: data.title },
  });

  return activity;
}

export type UpdateOptions = { notify: boolean };

export async function updateActivity(
  tenantId: string,
  activityId: string,
  data: Partial<ActivityWrite>,
  actor: AdminActor,
  options: UpdateOptions,
) {
  const outcome = await withTenant(tenantId, async (db) => {
    const before = await db.activity.findFirst({
      where: { id: activityId, deletedAt: null },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        placeId: true,
        status: true,
        eventId: true,
        event: { select: { slug: true, timezone: true, status: true, id: true } },
      },
    });
    if (!before) throw notFound({ activityId });

    const timeChanged = data.startsAt !== undefined && data.startsAt.getTime() !== before.startsAt.getTime();
    const placeChanged = data.placeId !== undefined && data.placeId !== before.placeId;
    const materialChange = (timeChanged || placeChanged) && before.event.status === 'PUBLISHED';

    const changeNote = timeChanged
      ? `Moved from ${formatTimeInZone(before.startsAt, before.event.timezone)} to ${formatTimeInZone(
          data.startsAt as Date,
          before.event.timezone,
        )}`
      : placeChanged
        ? 'Location changed'
        : undefined;

    const updated = await db.activity.update({
      where: { id: activityId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.track !== undefined ? { track: data.track as never } : {}),
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt } : {}),
        ...(data.endsAt !== undefined ? { endsAt: data.endsAt } : {}),
        ...(data.placeId !== undefined ? { placeId: data.placeId } : {}),
        ...(data.locationText !== undefined ? { locationText: data.locationText } : {}),
        ...(data.speakers !== undefined ? { speakers: data.speakers as Prisma.InputJsonValue } : {}),
        ...(data.bookingRequired !== undefined ? { bookingRequired: data.bookingRequired } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
        ...(data.isMandatory !== undefined ? { isMandatory: data.isMandatory } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(materialChange ? { status: 'MOVED' as const, changeNote } : {}),
      },
      select: { id: true, title: true },
    });

    return { updated, materialChange, changeNote, event: before.event };
  });

  await invalidateTenant(tenantId, 'programme');

  if (outcome.materialChange && options.notify) {
    await enqueueNotification({
      tenantId,
      eventId: outcome.event.id,
      kind: 'SCHEDULE_CHANGE',
      title: outcome.updated.title,
      body: outcome.changeNote ?? 'This session has changed.',
      linkUrl: `/events/${outcome.event.slug}/programme/${activityId}`,
      // Only people who saved or booked it — not the whole event (docs/06 §7).
      audience: { activityId },
      channels: ['inapp', 'push', 'email'],
      timezone: outcome.event.timezone,
      actor,
    });
  }

  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'activity.update',
    entityType: 'Activity',
    entityId: activityId,
    diff: { fields: Object.keys(data), notified: outcome.materialChange && options.notify },
  });

  return outcome.updated;
}

export async function cancelActivity(tenantId: string, activityId: string, actor: AdminActor, notify: boolean) {
  const outcome = await withTenant(tenantId, async (db) => {
    const activity = await db.activity.findFirst({
      where: { id: activityId, deletedAt: null },
      select: { id: true, title: true, event: { select: { id: true, slug: true, timezone: true } } },
    });
    if (!activity) throw notFound({ activityId });

    await db.activity.update({
      where: { id: activityId },
      data: { status: 'CANCELLED', changeNote: 'Cancelled' },
    });
    // The bookings go too: a cancelled session holds nobody's place.
    await db.activityBooking.updateMany({
      where: { activityId, status: { in: ['BOOKED', 'WAITLISTED'] } },
      data: { status: 'CANCELLED', cancelledAt: new Date(), waitlistPosition: null },
    });

    return activity;
  });

  await invalidateTenant(tenantId, 'programme');

  if (notify) {
    await enqueueNotification({
      tenantId,
      eventId: outcome.event.id,
      kind: 'SCHEDULE_CHANGE',
      title: `${outcome.title} is cancelled`,
      body: 'This session will not take place. Sorry for the change.',
      linkUrl: `/events/${outcome.event.slug}/programme`,
      audience: { activityId },
      channels: ['inapp', 'push', 'email'],
      timezone: outcome.event.timezone,
      actor,
    });
  }

  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'activity.cancel',
    entityType: 'Activity',
    entityId: activityId,
    diff: { notified: notify },
  });
}

/** docs/10 §3.3 — same place, same time is a mistake worth catching early. */
export async function findPlaceConflicts(tenantId: string, eventId: string) {
  const activities = await withTenant(tenantId, (db) =>
    db.activity.findMany({
      where: { eventId, deletedAt: null, placeId: { not: null }, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, title: true, startsAt: true, endsAt: true, placeId: true, place: { select: { name: true } } },
    }),
  );

  const conflicts: Array<{ a: string; b: string; place: string }> = [];
  for (let i = 0; i < activities.length; i += 1) {
    for (let j = i + 1; j < activities.length; j += 1) {
      const first = activities[i];
      const second = activities[j];
      if (!first || !second) continue;
      if (first.placeId !== second.placeId) continue;
      if (second.startsAt >= first.endsAt) break;
      conflicts.push({ a: first.title, b: second.title, place: first.place?.name ?? '' });
    }
  }
  return conflicts;
}

/**
 * docs/11-notifications.md §5 — new sessions in a published event accumulate for
 * six hours and go out as one "5 new sessions added" message.
 */
export async function announcePendingActivities(tenantId: string, eventId: string, actor?: AdminActor) {
  const pending = await withTenant(tenantId, (db) =>
    db.activity.findMany({
      where: { eventId, deletedAt: null, announcedAt: null, status: { not: 'CANCELLED' } },
      select: { id: true },
    }),
  );
  if (pending.length === 0) return { announced: 0 };

  const event = await withTenant(tenantId, (db) =>
    db.event.findFirst({ where: { id: eventId }, select: { slug: true, title: true, timezone: true, status: true } }),
  );
  // Drafts never notify anyone (docs/11 §5).
  if (!event || event.status !== 'PUBLISHED') return { announced: 0 };

  await enqueueNotification({
    tenantId,
    eventId,
    kind: 'PROGRAMME_UPDATE',
    title: `${pending.length} new session${pending.length === 1 ? '' : 's'} added`,
    body: `The programme for ${event.title} has been updated.`,
    linkUrl: `/events/${event.slug}/programme?added=recent`,
    audience: { registeredOnly: true },
    channels: ['inapp', 'push'],
    timezone: event.timezone,
    actor: actor ?? null,
  });

  await withTenant(tenantId, (db) =>
    db.activity.updateMany({
      where: { id: { in: pending.map((activity) => activity.id) } },
      data: { announcedAt: new Date() },
    }),
  );

  return { announced: pending.length };
}

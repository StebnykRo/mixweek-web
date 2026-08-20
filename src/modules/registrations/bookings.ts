import type { BookingStatus } from '@prisma/client';
import { withTenant, type TenantDb } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { invalidateTenant } from '@/lib/cache';
import { eventPhase } from '@/modules/events/time';
import { getSetting } from '@/modules/tenancy/settings';

/**
 * docs/06-events.md §5 — activity bookings use the same transactional capacity
 * logic as event registration, with the same no-overbooking guarantee.
 */

export type BookResult = { status: BookingStatus; waitlistPosition: number | null; bookingId: string };

export async function bookActivity(input: {
  tenantId: string;
  activityId: string;
  userId: string;
  actorEmail: string;
  ip: string | null;
  requestId?: string;
}): Promise<BookResult> {
  const now = new Date();

  const result = await withTenant(input.tenantId, async (db, tenantId) => {
    const activity = await db.activity.findFirst({
      where: { id: input.activityId, deletedAt: null },
      select: {
        id: true,
        eventId: true,
        status: true,
        bookingRequired: true,
        capacity: true,
        waitlistEnabled: true,
        bookingOpensAt: true,
        bookingClosesAt: true,
        startsAt: true,
        event: { select: { startsAt: true, endsAt: true, timezone: true, status: true } },
      },
    });
    if (!activity) throw notFound({ activityId: input.activityId });
    if (!activity.bookingRequired) throw new AppError('CONFLICT', 'This session does not need a booking');
    if (activity.status === 'CANCELLED') throw new AppError('CONFLICT', 'This session has been cancelled');
    if (eventPhase(activity.event) === 'past') throw new AppError('EVENT_ENDED');
    if (activity.bookingOpensAt && now < activity.bookingOpensAt) throw new AppError('BOOKING_CLOSED');
    if (activity.bookingClosesAt && now > activity.bookingClosesAt) throw new AppError('BOOKING_CLOSED');
    if (now > activity.startsAt) throw new AppError('BOOKING_CLOSED');

    await db.$executeRaw`SELECT id FROM "Activity" WHERE id = ${activity.id} FOR UPDATE`;

    const existing = await db.activityBooking.findFirst({
      where: { activityId: activity.id, userId: input.userId },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== 'CANCELLED') {
      throw new AppError('CONFLICT', 'You already have a place on this session');
    }

    const taken = await db.activityBooking.count({
      where: { activityId: activity.id, status: { in: ['BOOKED', 'ATTENDED'] } },
    });

    let status: BookingStatus;
    let waitlistPosition: number | null = null;

    if (activity.capacity === null || taken < activity.capacity) {
      status = 'BOOKED';
    } else if (activity.waitlistEnabled) {
      status = 'WAITLISTED';
      const last = await db.activityBooking.aggregate({
        where: { activityId: activity.id, status: 'WAITLISTED' },
        _max: { waitlistPosition: true },
      });
      waitlistPosition = (last._max.waitlistPosition ?? 0) + 1;
    } else {
      throw new AppError('EVENT_FULL');
    }

    const booking = existing
      ? await db.activityBooking.update({
          where: { id: existing.id },
          data: { status, waitlistPosition, cancelledAt: null },
          select: { id: true },
        })
      : await db.activityBooking.create({
          // tenantId is overwritten by the tenantGuard extension; it is written
          // here only so the create input is complete for the type checker.
          data: { tenantId, activityId: activity.id, userId: input.userId, status, waitlistPosition },
          select: { id: true },
        });

    return { status, waitlistPosition, bookingId: booking.id, eventId: activity.eventId };
  });

  await invalidateTenant(input.tenantId, 'programme');
  await auditLog({
    tenantId: input.tenantId,
    actorId: input.userId,
    actorEmail: input.actorEmail,
    action: 'booking.create',
    entityType: 'ActivityBooking',
    entityId: result.bookingId,
    diff: { status: result.status },
    ip: input.ip,
    requestId: input.requestId ?? null,
  });

  return { status: result.status, waitlistPosition: result.waitlistPosition, bookingId: result.bookingId };
}

export async function cancelBooking(input: {
  tenantId: string;
  activityId: string;
  userId: string;
  actorEmail: string;
  ip: string | null;
}): Promise<{ promotedUserId: string | null }> {
  const cancelHours = (await getSetting('booking.cancel_hours_before', { tenantId: input.tenantId })) as number;

  const promoted = await withTenant(input.tenantId, async (db) => {
    const activity = await db.activity.findFirst({
      where: { id: input.activityId, deletedAt: null },
      select: { id: true, capacity: true, startsAt: true },
    });
    if (!activity) throw notFound({ activityId: input.activityId });

    const cutoff = new Date(activity.startsAt.getTime() - cancelHours * 60 * 60 * 1000);
    if (new Date() > cutoff) {
      throw new AppError('CONFLICT', `Bookings can be cancelled up to ${cancelHours} h before the start`);
    }

    await db.$executeRaw`SELECT id FROM "Activity" WHERE id = ${activity.id} FOR UPDATE`;

    const booking = await db.activityBooking.findFirst({
      where: { activityId: activity.id, userId: input.userId, status: { in: ['BOOKED', 'WAITLISTED'] } },
      select: { id: true, status: true },
    });
    if (!booking) throw notFound({ activityId: input.activityId });

    await db.activityBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), waitlistPosition: null },
    });

    if (booking.status === 'WAITLISTED') {
      await renumberBookingWaitlist(db, activity.id);
      return null;
    }

    if (activity.capacity !== null) {
      const taken = await db.activityBooking.count({
        where: { activityId: activity.id, status: { in: ['BOOKED', 'ATTENDED'] } },
      });
      if (taken >= activity.capacity) return null;
    }

    const next = await db.activityBooking.findFirst({
      where: { activityId: activity.id, status: 'WAITLISTED' },
      orderBy: [{ waitlistPosition: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, userId: true },
    });
    if (!next) return null;

    await db.activityBooking.update({
      where: { id: next.id },
      data: { status: 'BOOKED', waitlistPosition: null },
    });
    await renumberBookingWaitlist(db, activity.id);
    return next.userId;
  });

  await invalidateTenant(input.tenantId, 'programme');
  await auditLog({
    tenantId: input.tenantId,
    actorId: input.userId,
    actorEmail: input.actorEmail,
    action: 'booking.cancel',
    entityType: 'Activity',
    entityId: input.activityId,
    diff: { promoted: promoted !== null },
    ip: input.ip,
  });

  return { promotedUserId: promoted };
}

export async function renumberBookingWaitlist(db: TenantDb, activityId: string): Promise<void> {
  const queue = await db.activityBooking.findMany({
    where: { activityId, status: 'WAITLISTED' },
    orderBy: [{ waitlistPosition: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, waitlistPosition: true },
  });
  let position = 1;
  for (const entry of queue) {
    if (entry.waitlistPosition !== position) {
      await db.activityBooking.update({ where: { id: entry.id }, data: { waitlistPosition: position } });
    }
    position += 1;
  }
}

/** docs/07 §6 — "♥" is instant and unconstrained: no capacity, no waiting list. */
export async function setSaved(input: {
  tenantId: string;
  activityId: string;
  userId: string;
  saved: boolean;
}): Promise<{ saved: boolean }> {
  await withTenant(input.tenantId, async (db, tenantId) => {
    const activity = await db.activity.findFirst({
      where: { id: input.activityId, deletedAt: null },
      select: { id: true },
    });
    if (!activity) throw notFound({ activityId: input.activityId });

    if (input.saved) {
      await db.savedActivity.upsert({
        where: { userId_activityId: { userId: input.userId, activityId: activity.id } },
        create: { tenantId, userId: input.userId, activityId: activity.id },
        update: {},
      });
    } else {
      await db.savedActivity.deleteMany({ where: { userId: input.userId, activityId: activity.id } });
    }
  });
  return { saved: input.saved };
}

export type MySchedule = {
  saved: string[];
  booked: string[];
  waitlisted: string[];
  mandatory: string[];
};

/** docs/06 §6 — the personal layer the client overlays on the cached programme. */
export async function getMySchedule(tenantId: string, eventId: string, userId: string): Promise<MySchedule> {
  return withTenant(tenantId, async (db) => {
    const [saved, bookings, mandatory] = await Promise.all([
      db.savedActivity.findMany({
        where: { userId, activity: { eventId, deletedAt: null } },
        select: { activityId: true },
      }),
      db.activityBooking.findMany({
        where: { userId, status: { in: ['BOOKED', 'WAITLISTED', 'ATTENDED'] }, activity: { eventId, deletedAt: null } },
        select: { activityId: true, status: true },
      }),
      db.activity.findMany({ where: { eventId, isMandatory: true, deletedAt: null }, select: { id: true } }),
    ]);

    return {
      saved: saved.map((s) => s.activityId),
      booked: bookings.filter((b) => b.status !== 'WAITLISTED').map((b) => b.activityId),
      waitlisted: bookings.filter((b) => b.status === 'WAITLISTED').map((b) => b.activityId),
      mandatory: mandatory.map((m) => m.id),
    };
  });
}

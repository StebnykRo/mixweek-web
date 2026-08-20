import { Prisma } from '@prisma/client';
import type { RegistrationStatus } from '@prisma/client';
import { withTenant, type TenantDb } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { randomBase32Code, sha256 } from '@/lib/crypto/hash';
import { eventPhase } from '@/modules/events/time';
import { registrationGate } from '@/modules/events/service';
import { validateAnswers } from './form';

/**
 * docs/06-events.md §4.3 — capacity and waiting list.
 *
 * The hard requirement is no overbooking under concurrent requests. Three
 * things guarantee it together:
 *   1. `SELECT ... FOR UPDATE` on the Event row serialises the counters;
 *   2. the count and the insert happen in the same transaction;
 *   3. the partial unique index `registration_active_uniq` makes a duplicate
 *      active registration impossible even if 1 and 2 were ever bypassed.
 */

export type RegisterInput = {
  tenantId: string;
  eventId: string;
  userId: string;
  answers: unknown;
  actorEmail: string;
  ip: string | null;
  userAgent: string | null;
  requestId?: string;
};

export type RegisterResult = {
  status: RegistrationStatus;
  waitlistPosition: number | null;
  registrationId: string;
  checkInCode: string | null;
};

export async function registerForEvent(input: RegisterInput): Promise<RegisterResult> {
  const now = new Date();

  const result = await withTenant(
    input.tenantId,
    async (db, tenantId) => {
      const event = await db.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          capacity: true,
          waitlistEnabled: true,
          approvalRequired: true,
          registrationEnabled: true,
          registrationOpensAt: true,
          registrationClosesAt: true,
          registrationForm: true,
        },
      });
      if (!event) throw notFound({ eventId: input.eventId });

      // Serialise every concurrent registration for this event behind one lock.
      await db.$executeRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;

      const existing = await db.eventRegistration.findFirst({
        where: { eventId: event.id, userId: input.userId },
        select: { id: true, status: true, waitlistPosition: true },
      });
      if (existing && ['PENDING', 'CONFIRMED', 'WAITLISTED', 'ATTENDED'].includes(existing.status)) {
        throw new AppError('CONFLICT', 'You are already registered for this event');
      }

      const counted = await db.eventRegistration.count({
        where: { eventId: event.id, status: { in: ['CONFIRMED', 'PENDING', 'ATTENDED'] } },
      });

      const phase = eventPhase(event, now);
      const gate = registrationGate(event, phase, counted, now);
      if (!gate.open) {
        if (gate.reason === 'EVENT_ENDED') throw new AppError('EVENT_ENDED');
        if (gate.reason === 'EVENT_FULL') throw new AppError('EVENT_FULL');
        throw new AppError('REGISTRATION_CLOSED');
      }

      // Server-side validation of the answers. Extra keys are rejected.
      const answers = validateAnswers(event.registrationForm, input.answers);

      const hasRoom = event.capacity === null || counted < event.capacity;
      let status: RegistrationStatus;
      let waitlistPosition: number | null = null;

      if (hasRoom) {
        status = event.approvalRequired ? 'PENDING' : 'CONFIRMED';
      } else if (event.waitlistEnabled) {
        status = 'WAITLISTED';
        const last = await db.eventRegistration.aggregate({
          where: { eventId: event.id, status: 'WAITLISTED' },
          _max: { waitlistPosition: true },
        });
        waitlistPosition = (last._max.waitlistPosition ?? 0) + 1;
      } else {
        throw new AppError('EVENT_FULL');
      }

      // docs/06 §4.6 — the offline fallback code. Only its hash is stored.
      const checkInCode = status === 'CONFIRMED' ? randomBase32Code(6) : null;

      const created = existing
        ? await db.eventRegistration.update({
            where: { id: existing.id },
            data: {
              status,
              waitlistPosition,
              answers: answers as Prisma.InputJsonValue,
              cancelledAt: null,
              checkInCodeHash: checkInCode ? sha256(`${event.id}:${checkInCode}`) : null,
            },
            select: { id: true },
          })
        : await db.eventRegistration.create({
            data: {
              // tenantId is written explicitly for type completeness; the
              // tenantGuard extension overwrites it with the session's tenant,
              // so a wrong value here cannot leak across tenants.
              tenantId,
              eventId: event.id,
              userId: input.userId,
              status,
              waitlistPosition,
              answers: answers as Prisma.InputJsonValue,
              checkInCodeHash: checkInCode ? sha256(`${event.id}:${checkInCode}`) : null,
            },
            select: { id: true },
          });

      return { status, waitlistPosition, registrationId: created.id, checkInCode };
    },
    { isolationLevel: 'ReadCommitted' },
  );

  await auditLog({
    tenantId: input.tenantId,
    actorId: input.userId,
    actorEmail: input.actorEmail,
    action: 'registration.create',
    entityType: 'EventRegistration',
    entityId: result.registrationId,
    diff: { status: result.status, waitlistPosition: result.waitlistPosition },
    ip: input.ip,
    userAgent: input.userAgent,
    requestId: input.requestId ?? null,
  });

  return result;
}

export type CancelResult = { promotedUserId: string | null };

/**
 * docs/06 §4.5 — cancelling frees the place and promotes the next person in
 * line inside the same transaction, so a place is never lost or double-issued.
 */
export async function cancelRegistration(input: {
  tenantId: string;
  eventId: string;
  userId: string;
  actorEmail: string;
  ip: string | null;
  requestId?: string;
}): Promise<CancelResult> {
  const promoted = await withTenant(input.tenantId, async (db) => {
    const event = await db.event.findFirst({
      where: { id: input.eventId, deletedAt: null },
      select: { id: true, capacity: true, startsAt: true, endsAt: true, timezone: true, status: true },
    });
    if (!event) throw notFound({ eventId: input.eventId });
    if (eventPhase(event) === 'past') throw new AppError('EVENT_ENDED');

    await db.$executeRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;

    const registration = await db.eventRegistration.findFirst({
      where: { eventId: event.id, userId: input.userId, status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED'] } },
      select: { id: true, status: true },
    });
    if (!registration) throw notFound({ eventId: input.eventId });

    await db.eventRegistration.update({
      where: { id: registration.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), waitlistPosition: null, checkInCodeHash: null },
    });

    if (registration.status === 'WAITLISTED') {
      await renumberWaitlist(db, event.id);
      return null;
    }

    return promoteFromWaitlist(db, event.id, event.capacity);
  });

  await auditLog({
    tenantId: input.tenantId,
    actorId: input.userId,
    actorEmail: input.actorEmail,
    action: 'registration.cancel',
    entityType: 'Event',
    entityId: input.eventId,
    diff: { promoted: promoted !== null },
    ip: input.ip,
    requestId: input.requestId ?? null,
  });

  return { promotedUserId: promoted };
}

/** Promotes exactly one person, only if a seat is genuinely free. */
export async function promoteFromWaitlist(
  db: TenantDb,
  eventId: string,
  capacity: number | null,
): Promise<string | null> {
  if (capacity !== null) {
    const taken = await db.eventRegistration.count({
      where: { eventId, status: { in: ['CONFIRMED', 'PENDING', 'ATTENDED'] } },
    });
    if (taken >= capacity) return null;
  }

  const next = await db.eventRegistration.findFirst({
    where: { eventId, status: 'WAITLISTED' },
    orderBy: [{ waitlistPosition: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, userId: true },
  });
  if (!next) return null;

  await db.eventRegistration.update({
    where: { id: next.id },
    data: {
      status: 'CONFIRMED',
      waitlistPosition: null,
      checkInCodeHash: sha256(`${eventId}:${randomBase32Code(6)}`),
    },
  });

  await renumberWaitlist(db, eventId);
  return next.userId;
}

/** Keeps waiting-list positions contiguous after any change. */
export async function renumberWaitlist(db: TenantDb, eventId: string): Promise<void> {
  const queue = await db.eventRegistration.findMany({
    where: { eventId, status: 'WAITLISTED' },
    orderBy: [{ waitlistPosition: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, waitlistPosition: true },
  });
  let position = 1;
  for (const entry of queue) {
    if (entry.waitlistPosition !== position) {
      await db.eventRegistration.update({ where: { id: entry.id }, data: { waitlistPosition: position } });
    }
    position += 1;
  }
}

export async function getMyRegistration(tenantId: string, eventId: string, userId: string) {
  return withTenant(tenantId, (db) =>
    db.eventRegistration.findFirst({
      where: { eventId, userId },
      select: {
        id: true,
        status: true,
        waitlistPosition: true,
        answers: true,
        checkedInAt: true,
        createdAt: true,
      },
    }),
  );
}

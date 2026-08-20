import { withTenant } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { sha256, timingSafeEqual } from '@/lib/crypto/hash';
import { eventPhase } from '@/modules/events/time';
import { issueSignedToken, verifySignedToken } from './tokens';

/**
 * docs/06-events.md §4.6 — two check-in modes.
 *
 * Online is the default: a 60-second signed token. Offline is the fallback for
 * a phone with no signal: a static base32 code, accepted only inside the event
 * dates and only once. That is a deliberate trade — the queue at the door is a
 * worse problem than a code passed to a colleague.
 */

export async function issueCheckInToken(tenantId: string, eventId: string, userId: string) {
  const registration = await withTenant(tenantId, (db) =>
    db.eventRegistration.findFirst({
      where: { eventId, userId, status: { in: ['CONFIRMED', 'ATTENDED'] } },
      select: { id: true },
    }),
  );
  if (!registration) throw notFound({ eventId });
  return issueSignedToken('checkin', registration.id, tenantId);
}

export type CheckInInput = {
  tenantId: string;
  eventId: string;
  actor: { userId: string; email: string; role: string | null };
  /** Either the scanned signed token, or the six-character offline code. */
  token?: string;
  offlineCode?: string;
};

export type CheckInOutcome = {
  status: 'checked-in' | 'already-checked-in';
  registrationId: string;
  userName: string | null;
  checkedInAt: Date;
  mode: 'online' | 'offline_code';
};

export async function checkIn(input: CheckInInput): Promise<CheckInOutcome> {
  const mode: 'online' | 'offline_code' = input.token ? 'online' : 'offline_code';

  const outcome = await withTenant(input.tenantId, async (db) => {
    const event = await db.event.findFirst({
      where: { id: input.eventId, deletedAt: null },
      select: { id: true, startsAt: true, endsAt: true, timezone: true, status: true },
    });
    if (!event) throw notFound({ eventId: input.eventId });

    let registrationId: string;

    if (input.token) {
      const verdict = await verifySignedToken('checkin', input.token, input.tenantId);
      if (!verdict.ok) {
        throw new AppError('VALIDATION_FAILED', verdict.reason === 'expired' ? 'This code has expired' : 'This code is not valid');
      }
      registrationId = verdict.subject;
    } else if (input.offlineCode) {
      // The offline code is only accepted while the event is actually running.
      if (eventPhase(event) !== 'live') {
        throw new AppError('CONFLICT', 'Offline codes are only accepted during the event');
      }
      const codeHash = sha256(`${event.id}:${input.offlineCode.trim().toUpperCase()}`);
      const match = await db.eventRegistration.findFirst({
        where: { eventId: event.id, checkInCodeHash: codeHash },
        select: { id: true, checkInCodeHash: true },
      });
      if (!match?.checkInCodeHash || !timingSafeEqual(match.checkInCodeHash, codeHash)) {
        throw notFound({ eventId: input.eventId });
      }
      registrationId = match.id;
    } else {
      throw new AppError('VALIDATION_FAILED', 'A code is required');
    }

    const registration = await db.eventRegistration.findFirst({
      where: { id: registrationId, eventId: event.id },
      select: { id: true, checkedInAt: true, status: true, user: { select: { name: true } } },
    });
    if (!registration) throw notFound({ registrationId });

    if (registration.checkedInAt) {
      return {
        status: 'already-checked-in' as const,
        registrationId: registration.id,
        userName: registration.user?.name ?? null,
        checkedInAt: registration.checkedInAt,
        mode,
      };
    }

    const checkedInAt = new Date();
    await db.eventRegistration.update({
      where: { id: registration.id },
      data: { checkedInAt, status: 'ATTENDED', checkInMode: mode },
    });

    return {
      status: 'checked-in' as const,
      registrationId: registration.id,
      userName: registration.user?.name ?? null,
      checkedInAt,
      mode,
    };
  });

  await auditLog({
    tenantId: input.tenantId,
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: 'registration.check_in',
    entityType: 'EventRegistration',
    entityId: outcome.registrationId,
    diff: { mode, result: outcome.status },
  });

  return outcome;
}

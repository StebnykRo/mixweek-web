import type { Prisma, Role } from '@prisma/client';
import { withTenant } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { eventPhase, type EventPhase } from './time';
import { EVENT_CARD_SELECT, EVENT_DETAIL_SELECT, PARTICIPANT_VISIBLE, type EventCard, type EventDetail } from './repository';

/**
 * docs/06-events.md §3 and §4.1 — listing, visibility and the registration
 * window. Everything here answers a participant's question; the admin side
 * lives in modules/admin.
 */

export type Viewer = {
  userId: string;
  tenantId: string;
  role: Role | null;
  department: string | null;
  team: string | null;
};

export type AudienceRules = {
  departments?: string[];
  teams?: string[];
  roles?: string[];
  userIds?: string[];
};

/** docs/06 §4.1 — TENANT | INVITE_ONLY | GROUP. */
export function matchesVisibility(
  event: { visibility: string; audienceRules: unknown; id: string },
  viewer: Viewer,
  inviteEventIds: Set<string>,
): boolean {
  if (event.visibility === 'TENANT') return viewer.role !== 'GUEST';
  if (event.visibility === 'INVITE_ONLY') return inviteEventIds.has(event.id);
  if (event.visibility === 'GROUP') {
    const rules = (event.audienceRules ?? {}) as AudienceRules;
    if (rules.userIds?.includes(viewer.userId)) return true;
    if (rules.departments?.length && viewer.department && rules.departments.includes(viewer.department)) return true;
    if (rules.teams?.length && viewer.team && rules.teams.includes(viewer.team)) return true;
    if (rules.roles?.length && viewer.role && rules.roles.includes(viewer.role)) return true;
    return false;
  }
  return false;
}

async function inviteEventIdsFor(tenantId: string, email: string): Promise<Set<string>> {
  const invites = await withTenant(tenantId, (db) =>
    db.invite.findMany({
      where: { email, expiresAt: { gt: new Date() }, eventId: { not: null } },
      select: { eventId: true },
    }),
  );
  return new Set(invites.map((i) => i.eventId).filter((id): id is string => id !== null));
}

export type EventListItem = EventCard & {
  phase: EventPhase;
  myStatus: string | null;
  waitlistPosition: number | null;
  hasMedia: boolean;
  registeredCount: number;
};

export type ListEventsInput = {
  viewer: Viewer;
  email: string;
  scope: 'upcoming' | 'past' | 'mine';
  q?: string;
  cursor?: string;
  limit: number;
  year?: number;
  city?: string;
};

export type ListEventsResult = { items: EventListItem[]; nextCursor: string | null; serverTime: string };

export async function listEvents(input: ListEventsInput): Promise<ListEventsResult> {
  const now = new Date();
  const { viewer, scope, limit } = input;
  const inviteIds = await inviteEventIdsFor(viewer.tenantId, input.email);

  const where: Prisma.EventWhereInput = {
    ...PARTICIPANT_VISIBLE,
    ...(input.city ? { city: input.city } : {}),
    ...(input.q ? { title: { contains: input.q, mode: 'insensitive' } } : {}),
  };

  if (scope === 'upcoming') where.startsAt = { gt: now };
  if (scope === 'past') where.endsAt = { lt: now };
  if (scope === 'mine') {
    where.registrations = {
      some: { userId: viewer.userId, status: { in: ['PENDING', 'CONFIRMED', 'WAITLISTED', 'ATTENDED'] } },
    };
  }
  if (input.year) {
    where.startsAt = {
      ...(typeof where.startsAt === 'object' && where.startsAt !== null ? where.startsAt : {}),
      gte: new Date(Date.UTC(input.year, 0, 1)),
      lt: new Date(Date.UTC(input.year + 1, 0, 1)),
    };
  }

  const orderBy: Prisma.EventOrderByWithRelationInput[] =
    scope === 'upcoming' ? [{ startsAt: 'asc' }, { id: 'asc' }] : [{ startsAt: 'desc' }, { id: 'desc' }];

  // Cursor pagination (docs/09 §1): the cursor is the last id we returned.
  const rows = await withTenant(viewer.tenantId, (db) =>
    db.event.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        ...EVENT_CARD_SELECT,
        registrations: {
          where: { userId: viewer.userId },
          select: { status: true, waitlistPosition: true },
          take: 1,
        },
        _count: { select: { registrations: { where: { status: { in: ['CONFIRMED', 'PENDING', 'ATTENDED'] } } } } },
        mediaLinks: { where: { status: 'PUBLISHED', deletedAt: null }, select: { id: true }, take: 1 },
      },
    }),
  );

  const visible = rows.filter((row) => matchesVisibility(row, viewer, inviteIds));
  const page = visible.slice(0, limit);
  const nextCursor = visible.length > limit ? (page[page.length - 1]?.id ?? null) : null;

  return {
    items: page.map((row) => {
      const { registrations, _count, mediaLinks, ...event } = row;
      return {
        ...event,
        phase: eventPhase(event, now),
        myStatus: registrations[0]?.status ?? null,
        waitlistPosition: registrations[0]?.waitlistPosition ?? null,
        hasMedia: mediaLinks.length > 0,
        registeredCount: _count.registrations,
      };
    }),
    nextCursor,
    serverTime: now.toISOString(),
  };
}

export type EventView = EventDetail & {
  phase: EventPhase;
  myRegistration: { status: string; waitlistPosition: number | null; checkedInAt: Date | null } | null;
  registeredCount: number;
  registrationOpen: boolean;
  registrationClosedReason: string | null;
  serverTime: string;
};

export async function getEventForViewer(slug: string, viewer: Viewer, email: string): Promise<EventView> {
  const now = new Date();
  const inviteIds = await inviteEventIdsFor(viewer.tenantId, email);

  const row = await withTenant(viewer.tenantId, (db) =>
    db.event.findFirst({
      where: { slug, ...PARTICIPANT_VISIBLE },
      select: {
        ...EVENT_DETAIL_SELECT,
        registrations: {
          where: { userId: viewer.userId },
          select: { status: true, waitlistPosition: true, checkedInAt: true },
          take: 1,
        },
        _count: { select: { registrations: { where: { status: { in: ['CONFIRMED', 'PENDING', 'ATTENDED'] } } } } },
      },
    }),
  );

  // A hidden event and a missing event are the same 404 (docs/12 §5).
  if (!row || !matchesVisibility(row, viewer, inviteIds)) throw notFound({ slug });

  const { registrations, _count, ...event } = row;
  const phase = eventPhase(event, now);
  const gate = registrationGate(event, phase, _count.registrations, now);

  return {
    ...event,
    phase,
    myRegistration: registrations[0]
      ? {
          status: registrations[0].status,
          waitlistPosition: registrations[0].waitlistPosition,
          checkedInAt: registrations[0].checkedInAt,
        }
      : null,
    registeredCount: _count.registrations,
    registrationOpen: gate.open,
    registrationClosedReason: gate.reason,
    serverTime: now.toISOString(),
  };
}

export type RegistrationGate = { open: boolean; reason: string | null };

/** docs/06 §4.1 — the registration window, expressed once. */
export function registrationGate(
  event: {
    status: string;
    registrationEnabled: boolean;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
    capacity: number | null;
    waitlistEnabled: boolean;
  },
  phase: EventPhase,
  registeredCount: number,
  now: Date,
): RegistrationGate {
  if (event.status !== 'PUBLISHED') return { open: false, reason: 'EVENT_NOT_PUBLISHED' };
  if (phase === 'past') return { open: false, reason: 'EVENT_ENDED' };
  if (!event.registrationEnabled) return { open: false, reason: 'REGISTRATION_DISABLED' };
  if (event.registrationOpensAt && now < event.registrationOpensAt) return { open: false, reason: 'REGISTRATION_NOT_OPEN' };
  if (event.registrationClosesAt && now > event.registrationClosesAt) return { open: false, reason: 'REGISTRATION_CLOSED' };
  if (event.capacity !== null && registeredCount >= event.capacity && !event.waitlistEnabled) {
    return { open: false, reason: 'EVENT_FULL' };
  }
  return { open: true, reason: null };
}

/** docs/06 §9 — everything that mutates is off once the event has ended. */
export function assertEventMutable(event: { startsAt: Date; endsAt: Date; timezone: string; status: string }): void {
  if (eventPhase(event) === 'past') throw new AppError('EVENT_ENDED');
  if (event.status === 'CANCELLED') throw new AppError('EVENT_ENDED', 'This event has been cancelled');
  if (event.status === 'ARCHIVED') throw new AppError('EVENT_ENDED');
}

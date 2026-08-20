import { createHash } from 'node:crypto';
import type { Prisma, Track } from '@prisma/client';
import { withTenant } from '@/lib/db/tenant-client';
import { notFound } from '@/lib/errors';
import { cached, tenantKey } from '@/lib/cache';
import { dayKey, withinTimeOfDay, zonedDayEnd, zonedDayStart } from '@/modules/events/time';
import type { ProgrammeQuery } from '@/modules/events/schemas';

/**
 * docs/07-screens.md §6 — the programme, with all four filter dimensions
 * combined by AND: day, category, time of day and place. Everything is
 * evaluated in the event's timezone, never the browser's.
 *
 * docs/01 §4 — this payload is shared by every participant, so it is cacheable.
 * The personal layer (♥, bookings) is a separate, uncached request that the
 * client overlays. The two are deliberately not mixed.
 */

const ACTIVITY_SELECT = {
  id: true,
  title: true,
  description: true,
  track: true,
  startsAt: true,
  endsAt: true,
  placeId: true,
  locationText: true,
  speakers: true,
  bookingRequired: true,
  capacity: true,
  waitlistEnabled: true,
  bookingOpensAt: true,
  bookingClosesAt: true,
  isFeatured: true,
  isMandatory: true,
  status: true,
  changeNote: true,
  sortOrder: true,
  updatedAt: true,
  place: { select: { id: true, name: true, kind: true } },
  _count: { select: { bookings: { where: { status: 'BOOKED' } } } },
} satisfies Prisma.ActivitySelect;

export type ActivityRow = Omit<Prisma.ActivityGetPayload<{ select: typeof ACTIVITY_SELECT }>, '_count'> & {
  bookedCount: number;
  waitlistCount: number;
};

export type ProgrammeResult = {
  eventId: string;
  timezone: string;
  days: string[];
  items: ActivityRow[];
  total: number;
  etag: string;
  serverTime: string;
};

export async function getProgramme(
  tenantId: string,
  eventId: string,
  timezone: string,
  query: ProgrammeQuery,
): Promise<ProgrammeResult> {
  // The cache key includes every filter parameter, so a 304 can never be
  // served for a different filter combination (docs/09 §3).
  const key = tenantKey(tenantId, 'programme', eventId, JSON.stringify(query));

  const serialised = await cached<SerialisedProgramme>(key, 60, async () => {
    const where: Prisma.ActivityWhereInput = { eventId, deletedAt: null };

    if (query.day) {
      where.startsAt = { gte: zonedDayStart(query.day, timezone), lt: zonedDayEnd(query.day, timezone) };
    }
    if (query.track?.length) where.track = { in: query.track as Track[] };
    if (query.place?.length) where.placeId = { in: query.place };
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };
    if (query.added === 'recent') {
      where.createdAt = { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) };
    }

    const rows = await withTenant(tenantId, (db) =>
      db.activity.findMany({
        where,
        orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        select: ACTIVITY_SELECT,
      }),
    );

    const waitlists = await withTenant(tenantId, (db) =>
      db.activityBooking.groupBy({
        by: ['activityId'],
        where: { activityId: { in: rows.map((r) => r.id) }, status: 'WAITLISTED' },
        _count: { _all: true },
      }),
    );
    const waitlistByActivity = new Map(waitlists.map((w) => [w.activityId, w._count._all]));

    // The time-of-day filter runs after the query, because "17:00–22:00 in
    // Asia/Nicosia" is not a fixed UTC range across a DST boundary.
    const filtered = rows.filter((row) =>
      query.from && query.to ? withinTimeOfDay(row.startsAt, timezone, query.from, query.to) : true,
    );

    const items = filtered.map(({ _count, ...row }) => ({
      ...row,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      bookingOpensAt: row.bookingOpensAt?.toISOString() ?? null,
      bookingClosesAt: row.bookingClosesAt?.toISOString() ?? null,
      bookedCount: _count.bookings,
      waitlistCount: waitlistByActivity.get(row.id) ?? 0,
    }));

    return { items, total: items.length };
  });

  const days = await eventDayKeys(tenantId, eventId, timezone);

  return {
    eventId,
    timezone,
    days,
    items: serialised.items.map(hydrate),
    total: serialised.total,
    etag: weakEtag(serialised),
    serverTime: new Date().toISOString(),
  };
}

/** Cache entries round-trip through JSON, so instants travel as ISO strings. */
type SerialisedActivity = Omit<ActivityRow, 'startsAt' | 'endsAt' | 'updatedAt' | 'bookingOpensAt' | 'bookingClosesAt'> & {
  startsAt: string;
  endsAt: string;
  updatedAt: string;
  bookingOpensAt: string | null;
  bookingClosesAt: string | null;
};

type SerialisedProgramme = { items: SerialisedActivity[]; total: number };

function hydrate(item: SerialisedActivity): ActivityRow {
  return {
    ...item,
    startsAt: new Date(item.startsAt),
    endsAt: new Date(item.endsAt),
    updatedAt: new Date(item.updatedAt),
    bookingOpensAt: item.bookingOpensAt ? new Date(item.bookingOpensAt) : null,
    bookingClosesAt: item.bookingClosesAt ? new Date(item.bookingClosesAt) : null,
  };
}

async function eventDayKeys(tenantId: string, eventId: string, timezone: string): Promise<string[]> {
  const event = await withTenant(tenantId, (db) =>
    db.event.findFirst({ where: { id: eventId }, select: { startsAt: true, endsAt: true } }),
  );
  if (!event) return [];
  const days: string[] = [];
  let cursor = event.startsAt;
  const last = dayKey(event.endsAt, timezone);
  for (let i = 0; i < 400; i += 1) {
    const key = dayKey(cursor, timezone);
    if (!days.includes(key)) days.push(key);
    if (key === last) break;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

export function weakEtag(payload: unknown): string {
  return `W/"${createHash('sha1').update(JSON.stringify(payload)).digest('base64url').slice(0, 27)}"`;
}

export async function getActivity(tenantId: string, eventId: string, activityId: string) {
  const row = await withTenant(tenantId, (db) =>
    db.activity.findFirst({ where: { id: activityId, eventId, deletedAt: null }, select: ACTIVITY_SELECT }),
  );
  if (!row) throw notFound({ activityId });
  const waitlistCount = await withTenant(tenantId, (db) =>
    db.activityBooking.count({ where: { activityId, status: 'WAITLISTED' } }),
  );
  const { _count, ...activity } = row;
  return { ...activity, bookedCount: _count.bookings, waitlistCount };
}

export { computeNowNext, findConflicts } from './now-next';

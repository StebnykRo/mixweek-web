import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { ProgrammeQuerySchema } from '@/modules/events/schemas';
import { getProgramme } from '@/modules/programme/service';
import { findConflicts } from '@/modules/programme/now-next';
import { getMySchedule } from '@/modules/registrations/bookings';
import { dayKey, durationLabel, formatTimeInZone, zoneOffsetLabel } from '@/modules/events/time';
import { PageHeader } from '@/components/patterns/page-header';
import { ProgrammeFilters } from '@/components/patterns/programme-filters';
import { ProgrammeList, type ProgrammeItem } from '@/components/patterns/programme-list';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Programme' };

const TRACKS = ['WORKSHOP', 'SPORT', 'PARTY', 'TEAM', 'LOGISTICS'];

/** docs/07-screens.md §6 — the programme with all four filters, state in the URL. */
export default async function ProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const rawQuery = await searchParams;
  const tenantId = session.tenantId;

  const event = await requireEvent(tenantId, slug);
  const query = ProgrammeQuerySchema.parse(
    Object.fromEntries(Object.entries(rawQuery).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])),
  );

  const [t, locale, programme, schedule, places] = await Promise.all([
    getTranslations('programme'),
    getLocale(),
    getProgramme(tenantId, event.id, event.timezone, query),
    getMySchedule(tenantId, event.id, session.userId),
    withTenant(tenantId, (db) =>
      db.place.findMany({
        where: { eventId: event.id, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true },
      }),
    ),
  ]);

  const todayKey = dayKey(new Date(), event.timezone);
  const days = programme.days.map((key) => ({
    key,
    label: new Intl.DateTimeFormat(locale, { timeZone: event.timezone, weekday: 'short', day: 'numeric' }).format(
      new Date(`${key}T12:00:00Z`),
    ),
    isToday: key === todayKey,
  }));

  const mine = new Set([...schedule.saved, ...schedule.booked, ...schedule.waitlisted]);
  const conflicts = findConflicts(programme.items.filter((item) => mine.has(item.id)));

  const items: ProgrammeItem[] = programme.items.map((item) => ({
    id: item.id,
    title: item.title,
    timeLabel: formatTimeInZone(item.startsAt, event.timezone, locale),
    durationLabel: durationLabel(item.endsAt.getTime() - item.startsAt.getTime(), locale),
    hourGroup: formatTimeInZone(item.startsAt, event.timezone, locale).slice(0, 2),
    dayGroup: new Intl.DateTimeFormat(locale, {
      timeZone: event.timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(item.startsAt),
    placeName: item.place?.name ?? item.locationText ?? null,
    track: item.track,
    status: item.status,
    changeNote: item.changeNote,
  }));

  return (
    <>
      <PageHeader
        title={t('title')}
        kicker={event.title}
        subtitle={t('timezoneNote', { timezone: zoneOffsetLabel(new Date(), event.timezone) })}
        backHref={`/events/${event.slug}`}
      />

      {/*
        ProgrammeFilters reads the query string with useSearchParams, so it needs
        its own boundary — without one the whole client subtree is skipped and
        the chips stop responding (Next.js requirement, not a preference).
      */}
      <Suspense fallback={<div className="h-40" aria-hidden="true" />}>
        <ProgrammeFilters days={days} tracks={TRACKS} places={places} resultCount={items.length} />
      </Suspense>

      <div className="mt-3">
        <ProgrammeList
          items={items}
          eventSlug={event.slug}
          saved={schedule.saved}
          booked={schedule.booked}
          waitlisted={schedule.waitlisted}
          conflicts={[...conflicts]}
          emptyTitle={t('empty')}
          emptyBody={t('emptyHint')}
        />
      </div>
    </>
  );
}

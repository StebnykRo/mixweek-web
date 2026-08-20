import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarArrowDown } from 'lucide-react';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { getMySchedule } from '@/modules/registrations/bookings';
import { findConflicts } from '@/modules/programme/now-next';
import { durationLabel, formatTimeInZone } from '@/modules/events/time';
import { PageHeader } from '@/components/patterns/page-header';
import { ProgrammeList, type ProgrammeItem } from '@/components/patterns/programme-list';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My programme' };

/** docs/07-screens.md §8 — ♥ saved, ✓ booked and ⏳ waiting, grouped by day. */
export default async function MyProgrammePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const tenantId = session.tenantId;
  const event = await requireEvent(tenantId, slug);

  const [t, locale, schedule] = await Promise.all([
    getTranslations('programme'),
    getLocale(),
    getMySchedule(tenantId, event.id, session.userId),
  ]);

  const ids = [...new Set([...schedule.saved, ...schedule.booked, ...schedule.waitlisted, ...schedule.mandatory])];

  const activities = ids.length
    ? await withTenant(tenantId, (db) =>
        db.activity.findMany({
          where: { id: { in: ids }, deletedAt: null },
          orderBy: { startsAt: 'asc' },
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            track: true,
            status: true,
            changeNote: true,
            locationText: true,
            place: { select: { name: true } },
          },
        }),
      )
    : [];

  const conflicts = findConflicts(activities);

  const items: ProgrammeItem[] = activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    timeLabel: formatTimeInZone(activity.startsAt, event.timezone, locale),
    durationLabel: durationLabel(activity.endsAt.getTime() - activity.startsAt.getTime(), locale),
    hourGroup: formatTimeInZone(activity.startsAt, event.timezone, locale).slice(0, 2),
    dayGroup: new Intl.DateTimeFormat(locale, {
      timeZone: event.timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(activity.startsAt),
    placeName: activity.place?.name ?? activity.locationText ?? null,
    track: activity.track,
    status: activity.status,
    changeNote: activity.changeNote,
  }));

  return (
    <>
      <PageHeader
        title={t('title')}
        kicker={event.title}
        backHref={`/events/${event.slug}`}
        actions={
          items.length > 0 ? (
            <Button variant="ghost" size="sm" asChild>
              <a href={`/api/v1/events/${event.slug}/my-schedule.ics`}>
                <CalendarArrowDown size={18} aria-hidden="true" />
                <span className="sr-only lg:not-sr-only">{t('exportAll')}</span>
              </a>
            </Button>
          ) : null
        }
      />

      <ProgrammeList
        items={items}
        eventSlug={event.slug}
        saved={schedule.saved}
        booked={schedule.booked}
        waitlisted={schedule.waitlisted}
        conflicts={[...conflicts]}
        emptyTitle={t('emptyMine')}
        emptyBody=""
      />

      {items.length === 0 ? (
        <div className="px-4 lg:px-8">
          <Link href={`/events/${event.slug}/programme`} className="font-semibold text-primary-700 underline">
            {t('title')} →
          </Link>
        </div>
      ) : null}
    </>
  );
}

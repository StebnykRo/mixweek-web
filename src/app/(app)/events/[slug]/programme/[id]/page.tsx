import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound as nextNotFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MapPin } from 'lucide-react';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { getActivity } from '@/modules/programme/service';
import { getMySchedule } from '@/modules/registrations/bookings';
import { durationLabel, formatDateInZone, formatTimeInZone } from '@/modules/events/time';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Markdown } from '@/components/patterns/markdown';
import { ActivityActions } from '@/components/patterns/activity-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Session' };

/** docs/07-screens.md §7 — session detail. A shareable URL, not a modal. */
export default async function ActivityPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug, id } = await params;
  const tenantId = session.tenantId;
  const event = await requireEvent(tenantId, slug);

  const activity = await getActivity(tenantId, event.id, id).catch(() => null);
  if (!activity) nextNotFound();

  const [t, tt, locale, schedule] = await Promise.all([
    getTranslations('programme'),
    getTranslations('tracks'),
    getLocale(),
    getMySchedule(tenantId, event.id, session.userId),
  ]);

  const speakers = (activity.speakers ?? []) as Array<{ name: string; role?: string }>;

  return (
    <>
      <PageHeader title={activity.title} backHref={`/events/${event.slug}/programme`} />

      <div className="flex flex-col gap-5 px-4 pb-8 lg:max-w-3xl lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{tt(activity.track as never)}</Badge>
          {activity.status === 'MOVED' ? <Badge tone="warning">{activity.changeNote ?? t('moved')}</Badge> : null}
          {activity.status === 'CANCELLED' ? <Badge tone="danger">{t('cancelled')}</Badge> : null}
        </div>

        <div>
          <p className="text-sm font-semibold">
            {formatDateInZone(activity.startsAt, event.timezone, locale)} ·{' '}
            {formatTimeInZone(activity.startsAt, event.timezone, locale)}–
            {formatTimeInZone(activity.endsAt, event.timezone, locale)}
          </p>
          <p className="text-xs text-ink-muted">
            {durationLabel(activity.endsAt.getTime() - activity.startsAt.getTime(), locale)}
          </p>
        </div>

        {activity.place ? (
          <Link
            href={`/events/${event.slug}/map/${activity.place.id}`}
            className="inline-flex items-center gap-1.5 font-semibold text-primary-700 underline"
          >
            <MapPin size={16} aria-hidden="true" />
            {activity.place.name}
          </Link>
        ) : activity.locationText ? (
          <p className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
            <MapPin size={16} aria-hidden="true" />
            {activity.locationText}
          </p>
        ) : null}

        {activity.description ? <Markdown source={activity.description} /> : null}

        {speakers.length > 0 ? (
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{t('speakers')}</h2>
            <ul className="flex flex-col gap-1.5">
              {speakers.map((speaker) => (
                <li key={speaker.name} className="rounded-md bg-surface px-4 py-3">
                  <p className="font-semibold">{speaker.name}</p>
                  {speaker.role ? <p className="text-xs text-ink-muted">{speaker.role}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ActivityActions
          activityId={activity.id}
          eventSlug={event.slug}
          bookingRequired={activity.bookingRequired}
          capacity={activity.capacity}
          bookedCount={activity.bookedCount}
          waitlistCount={activity.waitlistCount}
          cancelled={activity.status === 'CANCELLED'}
          initialSaved={schedule.saved.includes(activity.id)}
          initialBooked={schedule.booked.includes(activity.id)}
          initialWaitlisted={schedule.waitlisted.includes(activity.id)}
          title={activity.title}
          startsAt={activity.startsAt.toISOString()}
          endsAt={activity.endsAt.toISOString()}
        />
      </div>
    </>
  );
}

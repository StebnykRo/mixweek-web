import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { viewerOf } from '@/lib/http/viewer';
import { listEvents } from '@/modules/events/service';
import { EventCard } from '@/components/patterns/event-card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/patterns/page-header';
import { unreadCount } from '@/modules/notifications/service';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Events' };

type Scope = 'upcoming' | 'past' | 'mine';

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const params = await searchParams;
  const scope: Scope = params.scope === 'past' || params.scope === 'mine' ? params.scope : 'upcoming';

  const [t, locale, unread] = await Promise.all([
    getTranslations('events'),
    getLocale(),
    unreadCount(session.tenantId, session.userId),
  ]);

  const result = await listEvents({
    viewer: viewerOf(session),
    email: session.user.email,
    scope,
    limit: 20,
    q: params.q,
  });

  // docs/06 §3 — a single active event opens directly, with the list still
  // reachable from the navigation.
  if (scope === 'upcoming' && !params.q && !params.stay) {
    const live = result.items.filter((item) => item.phase === 'live' && item.status === 'PUBLISHED');
    if (live.length === 1 && live[0]) redirect(`/events/${live[0].slug}`);
  }

  const tabs: Array<{ scope: Scope; label: string }> = [
    { scope: 'upcoming', label: t('upcoming') },
    { scope: 'past', label: t('past') },
    { scope: 'mine', label: t('mine') },
  ];

  return (
    <>
      <PageHeader
        title={t('title')}
        userLabel={session.user.name ?? session.user.email}
        unreadCount={unread}
        notificationsLabel="Notifications"
      />

      <nav aria-label={t('title')} className="chip-scroll px-4 pb-4 lg:px-8">
        {tabs.map((tab) => (
          <Link
            key={tab.scope}
            href={`/events?scope=${tab.scope}&stay=1`}
            aria-current={tab.scope === scope ? 'page' : undefined}
            className={cn(
              'inline-flex h-11 items-center rounded-pill border px-4 text-sm font-semibold',
              tab.scope === scope
                ? 'border-primary-500 bg-primary-500 text-neutral-50'
                : 'border-divider bg-surface text-ink',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 pb-8 lg:px-8">
        {result.items.length === 0 ? (
          <EmptyState
            title={scope === 'upcoming' ? t('emptyUpcoming') : scope === 'past' ? t('emptyPast') : t('emptyMine')}
            action={
              scope !== 'upcoming' ? (
                <Link href="/events?scope=upcoming&stay=1" className="font-semibold text-primary-700 underline">
                  {t('browseUpcoming')}
                </Link>
              ) : null
            }
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.items.map((event) => (
              <li key={event.id}>
                <EventCard
                  slug={event.slug}
                  title={event.title}
                  subtitle={event.subtitle}
                  coverUrl={event.coverUrl}
                  city={event.city}
                  dateLabel={formatRange(event.startsAt, event.endsAt, event.timezone, locale)}
                  phase={event.phase}
                  status={event.status}
                  hasMedia={event.hasMedia}
                  mediaLabel={t('hasPhotos')}
                  liveLabel={t('live')}
                  cancelledLabel={t('cancelled')}
                  badge={statusBadge(event, t)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function statusBadge(
  event: { myStatus: string | null; phase: string; registrationOpen?: boolean },
  t: Awaited<ReturnType<typeof getTranslations<'events'>>>,
): { label: string; tone: 'success' | 'warning' | 'neutral' } | null {
  if (event.myStatus === 'CONFIRMED' || event.myStatus === 'PENDING') return { label: t('registered'), tone: 'success' };
  if (event.myStatus === 'WAITLISTED') return { label: t('waitlisted'), tone: 'warning' };
  if (event.myStatus === 'ATTENDED') return { label: t('attended'), tone: 'neutral' };
  return null;
}

/** Dates render in the event's own timezone, never the browser's (docs/13 §5). */
function formatRange(startsAt: Date, endsAt: Date, timezone: string, locale: string): string {
  const sameDay = startsAt.toDateString() === endsAt.toDateString();
  const day = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'short' });
  const full = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric' });
  return sameDay ? full.format(startsAt) : `${day.format(startsAt)} – ${full.format(endsAt)}`;
}

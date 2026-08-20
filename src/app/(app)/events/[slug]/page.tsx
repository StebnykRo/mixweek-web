import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound as nextNotFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { CalendarHeart, LifeBuoy, Map as MapIcon, Sparkles } from 'lucide-react';
import { getSession } from '@/lib/http/context';
import { viewerOf, requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { getEventForViewer } from '@/modules/events/service';
import { getProgramme } from '@/modules/programme/service';
import { getMySchedule } from '@/modules/registrations/bookings';
import { listPublishedMedia } from '@/modules/media/service';
import { formatDateInZone, zoneOffsetLabel } from '@/modules/events/time';
import { PageHeader } from '@/components/patterns/page-header';
import { AnnouncementBanner } from '@/components/patterns/announcement-banner';
import { NowNext } from '@/components/patterns/now-next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { unreadCount } from '@/modules/notifications/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const session = await getSession();
  if (!session?.tenantId) return { title: 'Event' };
  const event = await requireEvent(session.tenantId, (await params).slug).catch(() => null);
  return { title: event?.title ?? 'Event' };
}

/** docs/07-screens.md §4 — the Home screen of one event. */
export default async function EventHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  const { slug } = await params;
  const tenantId = session.tenantId;

  const event = await getEventForViewer(slug, viewerOf(session), session.user.email).catch(() => null);
  if (!event) nextNotFound();

  const [t, th, locale, unread] = await Promise.all([
    getTranslations('home'),
    getTranslations('nav'),
    getLocale(),
    unreadCount(tenantId, session.userId),
  ]);

  const [programme, schedule, announcements, media] = await Promise.all([
    getProgramme(tenantId, event.id, event.timezone, {}),
    getMySchedule(tenantId, event.id, session.userId),
    withTenant(tenantId, (db) =>
      db.announcement.findMany({
        where: {
          eventId: event.id,
          isPublished: true,
          deletedAt: null,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
            { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          ],
        },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        take: 3,
        select: { id: true, title: true, body: true, severity: true, linkUrl: true },
      }),
    ),
    listPublishedMedia(tenantId, event.id),
  ]);

  const featured = programme.items.find((item) => item.isFeatured && item.status !== 'CANCELLED');
  const showRegisterCta = event.registrationOpen && !event.myRegistration;

  return (
    <>
      <PageHeader
        title={event.title}
        kicker={formatDateInZone(new Date(), event.timezone, locale)}
        subtitle={`${event.city ?? ''}${event.city ? ' · ' : ''}${zoneOffsetLabel(new Date(), event.timezone)}`}
        userLabel={session.user.name ?? session.user.email}
        unreadCount={unread}
        notificationsLabel={th('notifications')}
      />

      <div className="grid gap-6 px-4 pb-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <div className="flex flex-col gap-5">
          {announcements.map((announcement) => (
            <AnnouncementBanner
              key={announcement.id}
              id={announcement.id}
              title={announcement.title}
              body={announcement.body}
              severity={announcement.severity}
              linkUrl={announcement.linkUrl}
              dismissLabel="Dismiss"
            />
          ))}

          {showRegisterCta ? (
            <Card className="flex flex-col gap-3 p-5">
              <p className="font-semibold">{t('registerCta')}</p>
              <Button asChild size="lg">
                <Link href={`/events/${event.slug}/register`}>{t('registerCta')}</Link>
              </Button>
            </Card>
          ) : null}

          <NowNext
            activities={programme.items.map((item) => ({
              id: item.id,
              title: item.title,
              startsAt: item.startsAt.toISOString(),
              endsAt: item.endsAt.toISOString(),
              status: item.status,
              isFeatured: item.isFeatured,
              placeName: item.place?.name ?? item.locationText ?? null,
              track: item.track,
            }))}
            saved={schedule.saved}
            booked={schedule.booked}
            eventSlug={event.slug}
            timezone={event.timezone}
            serverTime={event.serverTime}
            eventStartsAt={event.startsAt.toISOString()}
            eventEndsAt={event.endsAt.toISOString()}
            mediaHref={media.total > 0 ? `/events/${event.slug}/media` : null}
          />

          <nav aria-label={t('quickActions')} className="grid grid-cols-3 gap-3">
            <QuickAction href={`/events/${event.slug}/map`} label={th('map')} icon={<MapIcon size={20} aria-hidden="true" />} />
            <QuickAction
              href={`/events/${event.slug}/my`}
              label={th('myProgramme')}
              icon={<CalendarHeart size={20} aria-hidden="true" />}
            />
            <QuickAction href={`/events/${event.slug}/help`} label={th('help')} icon={<LifeBuoy size={20} aria-hidden="true" />} />
          </nav>
        </div>

        <aside className="flex flex-col gap-5">
          {featured ? (
            <Link
              href={`/events/${event.slug}/style`}
              className="block rounded-lg bg-secondary-500 p-5 text-ink shadow-sm"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[2px]">
                <Sparkles size={14} aria-hidden="true" />
                {t('featured')}
              </p>
              <p className="mt-2 font-display text-2xl leading-tight">{featured.title}</p>
              <p className="mt-2 text-sm">
                {new Intl.DateTimeFormat(locale, {
                  timeZone: event.timezone,
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(featured.startsAt)}
                {featured.place ? ` · ${featured.place.name}` : ''}
              </p>
            </Link>
          ) : null}

          {media.total > 0 ? (
            <Card className="p-5">
              <p className="font-semibold">{th('media')}</p>
              <Link href={`/events/${event.slug}/media`} className="mt-2 inline-block text-sm font-semibold text-primary-700 underline">
                {t('seePhotos')}
              </Link>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-md bg-surface p-3 text-center text-xs font-semibold shadow-sm"
    >
      {icon}
      {label}
    </Link>
  );
}

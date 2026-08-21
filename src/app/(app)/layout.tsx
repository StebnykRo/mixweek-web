import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { getBrandForRequest } from '@/lib/brand-context';
import { unreadCount } from '@/modules/notifications/service';
import { isFeatureEnabled } from '@/modules/tenancy/settings';
import { withTenant } from '@/lib/db/tenant-client';
import { AppShell, type NavItem } from '@/components/patterns/app-shell';

export const dynamic = 'force-dynamic';

/**
 * The participant shell. Every page under it is behind a complete session:
 * signed in AND second factor satisfied where the tenant requires one.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.mfaSatisfied) redirect('/login/mfa');
  if (!session.tenantId) redirect('/login');

  const tenantId = session.tenantId;
  const [brand, t, unread] = await Promise.all([
    getBrandForRequest(),
    getTranslations('nav'),
    unreadCount(tenantId, session.userId),
  ]);

  const pathname = (await headers()).get('x-pathname') ?? '/events';

  /**
   * Which event the tabs belong to.
   *
   * Whichever event is open wins. The tabs used to be built from the soonest
   * upcoming event regardless of what was on screen, so opening a past event
   * and tapping Map, WinStyle or Programme silently moved you to a different
   * event — you could not look at last year's merchandise or floor plan at
   * all. Only outside an event does it fall back to the soonest upcoming one,
   * which is the case the original behaviour was written for (docs/06 §3).
   */
  const openSlug = /^\/events\/([^/?#]+)/.exec(pathname)?.[1];

  const activeEvent = openSlug
    ? await withTenant(tenantId, (db) =>
        db.event.findFirst({ where: { slug: openSlug, deletedAt: null }, select: { slug: true } }),
      )
    : await withTenant(tenantId, (db) =>
        db.event.findFirst({
          where: { status: 'PUBLISHED', endsAt: { gte: new Date() }, deletedAt: null },
          orderBy: { startsAt: 'asc' },
          select: { slug: true },
        }),
      );

  const base = activeEvent ? `/events/${activeEvent.slug}` : '/events';
  const winstyleEnabled = await isFeatureEnabled('module.winstyle', { tenantId });

  const nav: NavItem[] = [
    // exact: everything else on the event sits under this path.
    { href: base, label: t('home'), icon: 'home', exact: true },
    { href: `${base}/programme`, label: t('programme'), icon: 'programme' },
    { href: `${base}/map`, label: t('map'), icon: 'map' },
    ...(winstyleEnabled ? [{ href: `${base}/winstyle`, label: t('winstyle'), icon: 'winstyle' as const }] : []),
    // Switch event, register for another, or look back at a past one. Profile
    // is not here: the avatar in the top-right corner already goes there, and
    // repeating it would cost a tab slot for nothing.
    { href: '/events?stay=1', label: t('events'), icon: 'events' as const, exact: true },
  ];

  // Desktop sidebar only. Everything here is also reachable from the profile,
  // which is where people look for it on a phone.
  const secondaryNav = [
    { href: `${base}/my`, label: t('myProgramme') },
    { href: `${base}/style`, label: t('style') },
    { href: `${base}/travel`, label: t('travel') },
    { href: `${base}/media`, label: t('media') },
    { href: `${base}/help`, label: t('help') },
  ];

  return (
    <AppShell
      brand={brand}
      nav={nav}
      secondaryNav={secondaryNav}
      activePath={pathname}
      unreadCount={unread}
      userLabel={session.user.name ?? session.user.email}
      notificationsLabel={t('notifications')}
    >
      {children}
    </AppShell>
  );
}

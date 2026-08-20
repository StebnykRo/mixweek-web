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

  // The tab bar points at the current event when there is exactly one, so the
  // common case does not cost an extra tap (docs/06 §3).
  const activeEvent = await withTenant(tenantId, (db) =>
    db.event.findFirst({
      where: { status: 'PUBLISHED', endsAt: { gte: new Date() }, deletedAt: null },
      orderBy: { startsAt: 'asc' },
      select: { slug: true },
    }),
  );

  const base = activeEvent ? `/events/${activeEvent.slug}` : '/events';
  const winstyleEnabled = await isFeatureEnabled('module.winstyle', { tenantId });

  const nav: NavItem[] = [
    { href: base, label: t('home'), icon: 'home' },
    { href: `${base}/programme`, label: t('programme'), icon: 'programme' },
    { href: `${base}/map`, label: t('map'), icon: 'map' },
    ...(winstyleEnabled ? [{ href: `${base}/winstyle`, label: t('winstyle'), icon: 'winstyle' as const }] : []),
    { href: '/profile', label: t('profile'), icon: 'profile' },
  ];

  const secondaryNav = [
    { href: '/events', label: t('events') },
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

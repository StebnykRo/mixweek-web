import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  Bell,
  CalendarCheck,
  Images,
  ChevronRight,
  Database,
  Globe,
  LifeBuoy,
  LogOut,
  MonitorSmartphone,
  Plane,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { getSession } from '@/lib/http/context';
import { hasConfirmedTotp } from '@/modules/auth/totp';
import { getTenant } from '@/modules/tenancy/service';
import { PageHeader } from '@/components/patterns/page-header';
import { initials } from '@/components/patterns/app-shell';
import { LocaleSwitcher } from '@/components/patterns/locale-switcher';
import { SignOutButton } from '@/components/patterns/sign-out-button';
import { HrContactCard } from '@/components/patterns/hr-contact-card';
import { withTenant } from '@/lib/db/tenant-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Profile' };

/** docs/07-screens.md §15 — profile, security, privacy and the HR contact. */
export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const [t, tn, mfaEnrolled, tenant] = await Promise.all([
    getTranslations('profile'),
    getTranslations('nav'),
    hasConfirmedTotp(session.userId),
    getTenant(session.tenantId),
  ]);

  // The design reaches EventStyle, Travel and Help from the profile as well as
  // from the event tabs, which is where people look for them when they are not
  // already inside an event.
  const currentEvent = await withTenant(session.tenantId, (db) =>
    db.event.findFirst({
      where: { status: 'PUBLISHED', endsAt: { gte: new Date() }, deletedAt: null },
      orderBy: { startsAt: 'asc' },
      select: { slug: true },
    }),
  );

  const eventRows = currentEvent
    ? [
        {
          href: `/events/${currentEvent.slug}/my`,
          label: tn('myProgramme'),
          icon: <CalendarCheck size={20} aria-hidden="true" />,
        },
        {
          href: `/events/${currentEvent.slug}/media`,
          label: tn('media'),
          icon: <Images size={20} aria-hidden="true" />,
        },
        {
          href: `/events/${currentEvent.slug}/style`,
          label: tn('style'),
          icon: <Sparkles size={20} aria-hidden="true" />,
        },
        {
          href: `/events/${currentEvent.slug}/travel`,
          label: tn('travel'),
          icon: <Plane size={20} aria-hidden="true" />,
        },
        {
          href: `/events/${currentEvent.slug}/help`,
          label: tn('help'),
          icon: <LifeBuoy size={20} aria-hidden="true" />,
        },
      ]
    : [];

  const rows = [
    ...eventRows,
    { href: '/profile/notifications', label: t('notifications'), icon: <Bell size={20} aria-hidden="true" /> },
    { href: '/profile/sessions', label: t('sessions'), icon: <MonitorSmartphone size={20} aria-hidden="true" /> },
    { href: '/profile/privacy', label: t('privacy'), icon: <Database size={20} aria-hidden="true" /> },
    { href: '/legal/terms', label: t('legal'), icon: <ShieldCheck size={20} aria-hidden="true" /> },
  ];

  return (
    <>
      <PageHeader title={t('title')} backHref="/events" />

      <div className="flex flex-col gap-5 px-4 pb-8 lg:max-w-2xl lg:px-8">
        <div className="flex items-center gap-4 rounded-lg bg-surface p-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-pill bg-neutral-900 text-lg font-bold text-neutral-50">
            {initials(session.user.name ?? session.user.email)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-xl">{session.user.name ?? session.user.email}</p>
            <p className="truncate text-sm text-ink-muted">
              {[session.user.jobTitle, session.user.department, session.user.team].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <HrContactCard />

        <section className="rounded-lg bg-surface">
          <h2 className="flex items-center gap-2 px-5 pt-4 text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">
            <Globe size={14} aria-hidden="true" />
            {t('language')}
          </h2>
          <div className="p-5 pt-3">
            <LocaleSwitcher current={session.user.locale} available={tenant?.locales ?? ['en']} />
          </div>
        </section>

        <ul className="overflow-hidden rounded-lg bg-surface">
          {rows.map((row) => (
            <li key={row.href} className="border-b border-divider last:border-0">
              <Link href={row.href} className="flex min-h-[56px] items-center gap-3 px-5">
                {row.icon}
                <span className="flex-1 font-semibold">{row.label}</span>
                <ChevronRight size={18} aria-hidden="true" className="text-ink-muted" />
              </Link>
            </li>
          ))}
          <li className="border-b border-divider last:border-0">
            <Link href="/profile/sessions" className="flex min-h-[56px] items-center gap-3 px-5">
              <UserRound size={20} aria-hidden="true" />
              <span className="flex-1 font-semibold">{t('twoFactor')}</span>
              <span className="text-sm text-ink-muted">{mfaEnrolled ? t('twoFactorOn') : t('twoFactorOff')}</span>
              <ChevronRight size={18} aria-hidden="true" className="text-ink-muted" />
            </Link>
          </li>
        </ul>

        {session.role && session.role !== 'PARTICIPANT' && session.role !== 'GUEST' ? (
          <Link href="/admin" className="rounded-lg bg-neutral-900 p-4 text-center font-semibold text-neutral-50">
            {tn('admin')}
          </Link>
        ) : null}

        <SignOutButton label={t('logout')} allLabel={t('logoutAll')} icon={<LogOut size={18} aria-hidden="true" />} />

        <p className="text-center text-xs text-ink-muted">
          {t('version')} 1.0.0 · {tenant?.name}
        </p>
      </div>
    </>
  );
}

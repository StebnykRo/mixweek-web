import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { globalDb } from '@/lib/db/client';
import { PageHeader } from '@/components/patterns/page-header';
import { PrivacyPanel } from '@/components/patterns/privacy-panel';
import { DELETION_GRACE_DAYS } from '@/modules/admin/constants';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Privacy and data' };

/** docs/12-security.md §10 — export and erasure, with the grace period stated. */
export default async function PrivacyPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const [t, locale, user] = await Promise.all([
    getTranslations('profile'),
    getLocale(),
    globalDb.user.findUnique({ where: { id: session.userId }, select: { deletionRequestedAt: true } }),
  ]);

  const effective = user?.deletionRequestedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
        new Date(user.deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000),
      )
    : null;

  return (
    <>
      <PageHeader title={t('privacy')} backHref="/profile" />
      <div className="flex flex-col gap-5 px-4 pb-8 lg:max-w-2xl lg:px-8">
        <section className="rounded-lg bg-surface p-5 text-sm text-ink-muted">
          <p>
            We store your work email, the name and team you entered, your registrations and bookings, your
            notification settings and a pseudonymous identifier for product analytics. We do not store photos,
            your home address or any identity document.
          </p>
        </section>
        <PrivacyPanel deletionEffectiveAt={effective} />
      </div>
    </>
  );
}

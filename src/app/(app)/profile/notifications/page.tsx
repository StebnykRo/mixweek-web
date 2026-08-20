import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { getPreferences } from '@/modules/notifications/preferences';
import { PageHeader } from '@/components/patterns/page-header';
import { NotificationPreferences } from '@/components/patterns/notification-preferences';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notifications' };

/** docs/07-screens.md §15 — switches per type and channel, criticals locked. */
export default async function NotificationSettingsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const [t, preferences] = await Promise.all([
    getTranslations('profile'),
    getPreferences(session.tenantId, session.userId),
  ]);

  return (
    <>
      <PageHeader title={t('notifications')} backHref="/profile" />
      <div className="px-4 pb-8 lg:max-w-2xl lg:px-8">
        <NotificationPreferences initial={preferences} />
      </div>
    </>
  );
}

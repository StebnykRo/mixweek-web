import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { listSessions } from '@/modules/auth/session';
import { countRemainingRecoveryCodes, hasConfirmedTotp } from '@/modules/auth/totp';
import { PageHeader } from '@/components/patterns/page-header';
import { SessionList } from '@/components/patterns/session-list';
import { SecurityPanel } from '@/components/patterns/security-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Active sessions' };

/** docs/07-screens.md §15 — the devices someone is signed in on, and 2FA state. */
export default async function SessionsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const [t, locale, sessions, mfaEnrolled, recoveryLeft] = await Promise.all([
    getTranslations('profile'),
    getLocale(),
    listSessions(session.userId),
    hasConfirmedTotp(session.userId),
    countRemainingRecoveryCodes(session.userId),
  ]);

  return (
    <>
      <PageHeader title={t('sessions')} backHref="/profile" />
      <div className="flex flex-col gap-5 px-4 pb-8 lg:max-w-2xl lg:px-8">
        <SessionList
          sessions={sessions.map((item) => ({
            id: item.id,
            label: item.deviceLabel ?? 'Unknown device',
            lastSeen: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(item.lastSeenAt),
            current: item.id === session.sessionId,
          }))}
        />
        <SecurityPanel mfaEnrolled={mfaEnrolled} recoveryLeft={recoveryLeft} />
      </div>
    </>
  );
}

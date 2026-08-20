import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http/context';
import { hasConfirmedTotp } from '@/modules/auth/totp';
import { MfaForm } from './mfa-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Two-factor authentication', robots: { index: false, follow: false } };

/**
 * docs/03-auth.md §2 step 3 — a session exists but is not yet complete. If the
 * person has no authenticator, enrolment is forced here rather than optional.
 */
export default async function MfaPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.mfaSatisfied) redirect('/events');

  const enrolled = await hasConfirmedTotp(session.userId);
  return <MfaForm enrolled={enrolled} accountLabel={session.user.email} />;
}

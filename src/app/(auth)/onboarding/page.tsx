import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http/context';
import { getTenant } from '@/modules/tenancy/service';
import { getSetting } from '@/modules/tenancy/settings';
import { OnboardingFlow } from './onboarding-flow';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Welcome', robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session || !session.mfaSatisfied) redirect('/login');

  const tenant = session.tenantId ? await getTenant(session.tenantId) : null;
  const legalVersion = (await getSetting('legal.version', { tenantId: session.tenantId })) as string;

  return (
    <OnboardingFlow
      locales={tenant?.locales ?? ['en']}
      legalVersion={legalVersion}
      // Pre-filled from the CSV import when there was one (docs/07 §2).
      profile={{
        name: session.user.name ?? '',
        jobTitle: session.user.jobTitle ?? '',
        department: session.user.department ?? '',
        team: session.user.team ?? '',
        locale: session.user.locale,
      }}
    />
  );
}

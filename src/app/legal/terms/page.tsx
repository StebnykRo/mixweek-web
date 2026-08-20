import type { Metadata } from 'next';
import { getSetting } from '@/modules/tenancy/settings';
import { getSession } from '@/lib/http/context';

export const metadata: Metadata = { title: 'Terms of Use' };

export default async function TermsPage() {
  const session = await getSession();
  const version = (await getSetting('legal.version', { tenantId: session?.tenantId })) as string;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="font-display text-3xl">Terms of Use</h1>
      <p className="mt-1 text-xs text-ink-muted">Version {version}</p>
      <div className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed">
        <p>
          This application is provided by your employer to organise participation in corporate events. Access is
          limited to people with an active account at a participating company.
        </p>
        <h2 className="mt-4 font-display text-xl">Using the app</h2>
        <p>
          Use it for its purpose: finding the programme, registering, and coordinating with organisers. Do not share
          your sign-in link or code with anyone. Content published in the app belongs to the organising company.
        </p>
        <h2 className="mt-4 font-display text-xl">External links</h2>
        <p>
          Photo galleries and materials open on third-party sites. Those sites have their own terms and privacy
          policies, which we do not control.
        </p>
        <h2 className="mt-4 font-display text-xl">Availability</h2>
        <p>
          We aim to keep the app available throughout an event, but we do not guarantee uninterrupted access.
          Programme details may change; the app is the source of truth for the current schedule.
        </p>
        <p className="text-sm text-ink-muted">
          Questions about these terms go to your event organiser or people partner.
        </p>
      </div>
    </main>
  );
}

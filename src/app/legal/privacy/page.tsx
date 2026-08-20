import type { Metadata } from 'next';
import { getSetting } from '@/modules/tenancy/settings';
import { getSession } from '@/lib/http/context';

export const metadata: Metadata = { title: 'Privacy Policy' };

/** docs/12-security.md §10 — the categories and retention periods stated plainly. */
export default async function PrivacyPolicyPage() {
  const session = await getSession();
  const version = (await getSetting('legal.version', { tenantId: session?.tenantId })) as string;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <h1 className="font-display text-3xl">Privacy Policy</h1>
      <p className="mt-1 text-xs text-ink-muted">Version {version}</p>

      <div className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed">
        <h2 className="font-display text-xl">What we collect</h2>
        <ul className="ml-5 list-disc">
          <li>Your work email address, and the name, job title, department and team you provide.</li>
          <li>Your registrations, bookings, saved sessions and merch reservations.</li>
          <li>Answers to the registration form for the event you sign up to.</li>
          <li>Technical records needed for security: hashed session tokens, hashed IP addresses, sign-in attempts.</li>
          <li>Pseudonymous product analytics: which screens are opened, with no free text and no cookies.</li>
        </ul>

        <h2 className="mt-4 font-display text-xl">What we do not collect</h2>
        <p>
          No photographs, no date of birth, no home address, no identity documents, and no health data. Dietary
          preferences, if the organiser asks for them, are used to plan catering and deleted after the event.
        </p>

        <h2 className="mt-4 font-display text-xl">How long we keep it</h2>
        <ul className="ml-5 list-disc">
          <li>Sign-in tokens: 10 minutes, then deleted.</li>
          <li>Sessions: 30 days after they expire.</li>
          <li>Sign-in attempts: 90 days.</li>
          <li>Analytics events: 90 days, then only aggregates remain.</li>
          <li>Registrations for past events: anonymised after 24 months.</li>
          <li>Audit records: 24 months.</li>
        </ul>

        <h2 className="mt-4 font-display text-xl">Your rights</h2>
        <p>
          You can export your data or ask for your account to be deleted from Profile → Privacy and data. Deletion
          takes effect after 30 days, and you can cancel it at any point in that window. After deletion your
          historical registrations remain only as anonymous counts.
        </p>

        <h2 className="mt-4 font-display text-xl">Who else processes it</h2>
        <p>
          Hosting, email delivery, error monitoring and content delivery are handled by processors in the EU under
          contract. Photo galleries are hosted by third parties and open on their own sites.
        </p>
      </div>
    </main>
  );
}

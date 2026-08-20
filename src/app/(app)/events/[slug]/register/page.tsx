import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { viewerOf } from '@/lib/http/viewer';
import { getEventForViewer } from '@/modules/events/service';
import { parseRegistrationForm } from '@/modules/registrations/form';
import { PageHeader } from '@/components/patterns/page-header';
import { RegistrationForm } from '@/components/patterns/registration-form';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Register' };

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const event = await getEventForViewer(slug, viewerOf(session), session.user.email);
  const [t, locale] = await Promise.all([getTranslations('registration'), getLocale()]);

  // Already registered: the registration screen is not the place to manage it.
  if (event.myRegistration && ['CONFIRMED', 'PENDING', 'WAITLISTED'].includes(event.myRegistration.status)) {
    redirect(`/events/${event.slug}`);
  }

  const form = parseRegistrationForm(event.registrationForm);

  return (
    <>
      <PageHeader title={t('title')} kicker={event.title} backHref={`/events/${event.slug}`} />

      <div className="px-4 pb-8 lg:max-w-2xl lg:px-8">
        {event.registrationOpen ? (
          <RegistrationForm
            eventSlug={event.slug}
            event={{
              title: event.title,
              startsAt: new Date(event.startsAt).toISOString(),
              endsAt: new Date(event.endsAt).toISOString(),
              timezone: event.timezone,
              city: event.city ?? null,
              venueName: event.venueName ?? null,
            }}
            fields={form.fields}
            capacity={event.capacity}
            registeredCount={event.registeredCount}
            waitlistEnabled={event.waitlistEnabled}
            locale={locale}
          />
        ) : (
          <EmptyState
            title={t('closed')}
            action={
              <Link href={`/events/${event.slug}`} className="font-semibold text-primary-700 underline">
                {event.title}
              </Link>
            }
          />
        )}
      </div>
    </>
  );
}

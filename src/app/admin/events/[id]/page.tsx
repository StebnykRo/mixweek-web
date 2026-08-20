import { requirePermission } from '@/modules/admin/guard';
import { getAdminEvent, publicationChecklist } from '@/modules/admin/events';
import { EventSettingsForm } from '@/components/admin/event-settings-form';
import { PublishPanel } from '@/components/admin/publish-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Event settings' };

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('event:read');
  const { id } = await params;
  const [event, checklist] = await Promise.all([
    getAdminEvent(session.tenantId, id),
    publicationChecklist(session.tenantId, id),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <EventSettingsForm
        eventId={id}
        initial={{
          title: event.title,
          subtitle: event.subtitle ?? '',
          description: event.description ?? '',
          coverUrl: event.coverUrl ?? '',
          city: event.city ?? '',
          country: event.country ?? '',
          venueName: event.venueName ?? '',
          startsAt: toLocalInput(event.startsAt),
          endsAt: toLocalInput(event.endsAt),
          timezone: event.timezone,
          capacity: event.capacity,
          registrationEnabled: event.registrationEnabled,
          waitlistEnabled: event.waitlistEnabled,
          approvalRequired: event.approvalRequired,
          registrationOpensAt: event.registrationOpensAt ? toLocalInput(event.registrationOpensAt) : '',
          registrationClosesAt: event.registrationClosesAt ? toLocalInput(event.registrationClosesAt) : '',
          visibility: event.visibility,
        }}
      />
      <PublishPanel eventId={id} status={event.status} checklist={checklist} />
    </div>
  );
}

function toLocalInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}

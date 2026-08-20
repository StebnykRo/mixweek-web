import Link from 'next/link';
import { requirePermission, allows } from '@/modules/admin/guard';
import { listAdminEvents } from '@/modules/admin/events';
import { Badge } from '@/components/ui/badge';
import { NewEventButton } from '@/components/admin/new-event-button';
import { DuplicateEventButton } from '@/components/admin/duplicate-event-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events' };

/** docs/10-admin.md §3.2 — the events table. */
export default async function AdminEventsPage() {
  const session = await requirePermission('event:read');
  const events = await listAdminEvents(session.tenantId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Events</h1>
        {allows(session, 'event:write') ? <NewEventButton /> : null}
      </div>

      <ul className="flex flex-col gap-2">
        {events.map((event) => (
          <li key={event.id} className="rounded-lg bg-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/admin/events/${event.id}`} className="font-display text-lg">
                  {event.title}
                </Link>
                <p className="text-xs text-ink-muted">
                  /{event.slug} · {event.city ?? '—'} ·{' '}
                  {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: event.timezone }).format(
                    event.startsAt,
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={event.status === 'PUBLISHED' ? 'success' : event.status === 'DRAFT' ? 'neutral' : 'warning'}>
                  {event.status}
                </Badge>
                <Badge tone="primary">{event.phase}</Badge>
                <span className="text-xs text-ink-muted">
                  {event.registeredCount} registered · {event.activityCount} sessions
                </span>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href={`/admin/events/${event.id}`} className="font-semibold text-primary-700 underline">
                Settings
              </Link>
              <Link href={`/admin/events/${event.id}/programme`} className="font-semibold text-primary-700 underline">
                Programme
              </Link>
              <Link href={`/admin/events/${event.id}/registrations`} className="font-semibold text-primary-700 underline">
                Registrations
              </Link>
              <Link href={`/admin/events/${event.id}/media`} className="font-semibold text-primary-700 underline">
                Media
              </Link>
              {allows(session, 'event:write') ? (
                <DuplicateEventButton eventId={event.id} eventTitle={event.title} />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {events.length === 0 ? <p className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">No events yet.</p> : null}
    </div>
  );
}

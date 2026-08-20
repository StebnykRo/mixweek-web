import Link from 'next/link';
import { requireAdminSession } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { listAdminEvents } from '@/modules/admin/events';
import { registrationSummary } from '@/modules/admin/registrations';
import { eventPhase } from '@/modules/events/time';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard' };

/** docs/10-admin.md §3.1 — the numbers an organiser checks first. */
export default async function AdminDashboard() {
  const session = await requireAdminSession();
  const events = await listAdminEvents(session.tenantId);
  const current = events.find((event) => eventPhase(event) === 'live') ?? events[0];

  if (!current) {
    return (
      <div>
        <h1 className="font-display text-2xl">Dashboard</h1>
        <p className="mt-3 text-sm text-ink-muted">No events yet.</p>
        <Link href="/admin/events" className="mt-3 inline-block font-semibold text-primary-700 underline">
          Create the first one →
        </Link>
      </div>
    );
  }

  const [summary, upcoming, failedDeliveries, reservations] = await Promise.all([
    registrationSummary(session.tenantId, current.id),
    withTenant(session.tenantId, (db) =>
      db.activity.findMany({
        where: { eventId: current.id, deletedAt: null, startsAt: { gte: new Date() }, status: { not: 'CANCELLED' } },
        orderBy: { startsAt: 'asc' },
        take: 5,
        select: { id: true, title: true, startsAt: true, capacity: true, _count: { select: { bookings: true } } },
      }),
    ),
    withTenant(session.tenantId, (db) => db.notificationDelivery.count({ where: { status: 'FAILED' } })),
    withTenant(session.tenantId, (db) => db.order.count({ where: { eventId: current.id, status: 'RESERVED' } })),
  ]);

  const tiles = [
    { label: 'Registered', value: `${summary.byStatus.CONFIRMED ?? 0}${summary.capacity ? ` / ${summary.capacity}` : ''}` },
    { label: 'Waiting list', value: String(summary.byStatus.WAITLISTED ?? 0) },
    { label: 'Awaiting approval', value: String(summary.byStatus.PENDING ?? 0) },
    { label: 'Checked in', value: String(summary.checkedIn) },
    { label: 'Merch reserved', value: String(reservations) },
    { label: 'Failed deliveries', value: String(failedDeliveries) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl">{current.title}</h1>
        <p className="text-sm text-ink-muted">
          {eventPhase(current)} · {current.status.toLowerCase()}
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="rounded-lg bg-surface p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[1px] text-ink-muted">{tile.label}</p>
            <p className="mt-1 font-display text-3xl">{tile.value}</p>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="mb-2 text-sm font-bold">Coming up</h2>
        <ul className="flex flex-col gap-2">
          {upcoming.map((activity) => (
            <li key={activity.id} className="flex items-center justify-between rounded-md bg-surface px-4 py-3 text-sm">
              <span>
                <strong>{activity.title}</strong>
                <span className="ml-2 text-ink-muted">
                  {new Intl.DateTimeFormat('en-GB', {
                    timeZone: current.timezone,
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(activity.startsAt)}
                </span>
              </span>
              {activity.capacity ? (
                <span className="text-ink-muted">
                  {activity._count.bookings} / {activity.capacity}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/events/${current.id}/programme`} className="font-semibold text-primary-700 underline">
          Programme
        </Link>
        <Link href={`/admin/events/${current.id}/registrations`} className="font-semibold text-primary-700 underline">
          Registrations
        </Link>
        <Link href="/admin/checkin" className="font-semibold text-primary-700 underline">
          Check-in scanner
        </Link>
      </div>
    </div>
  );
}

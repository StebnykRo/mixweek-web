import { requirePermission } from '@/modules/admin/guard';
import { getInsights, MIN_GROUP_SIZE } from '@/modules/analytics/service';
import { listAdminEvents } from '@/modules/admin/events';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Insights' };

/** docs/10-admin.md §3.12a — aggregates only, small groups folded together. */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await requirePermission('analytics:read');
  const { eventId } = await searchParams;

  const events = await listAdminEvents(session.tenantId);
  const selected = eventId ?? events[0]?.id ?? null;

  const insights = await getInsights(session.tenantId, selected, {
    from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    to: new Date(),
  });

  const tiles = [
    { label: 'Event views', value: insights.funnel.eventViews },
    { label: 'Registrations', value: insights.funnel.registrations },
    { label: 'PWA installs', value: insights.pwaInstalls },
    { label: 'Push permissions', value: insights.pushPermissions },
    { label: 'Media opened', value: insights.mediaOpens },
  ];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl">Insights</h1>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label} className="rounded-lg bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-[1px] text-ink-muted">{tile.label}</p>
            <p className="mt-1 font-display text-3xl">{tile.value}</p>
          </li>
        ))}
      </ul>

      <section className="rounded-lg bg-surface p-5">
        <h2 className="font-display text-lg">Registrations by status</h2>
        <ul className="mt-2 text-sm">
          {insights.registrationsByStatus.map((row) => (
            <li key={row.status} className="flex justify-between border-b border-divider py-1 last:border-0">
              <span>{row.status}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg bg-surface p-5">
        <h2 className="font-display text-lg">By department</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Groups smaller than {MIN_GROUP_SIZE} people are combined, so nobody can be identified from this breakdown.
        </p>
        <ul className="mt-2 text-sm">
          {insights.departments.map((row) => (
            <li key={row.department} className="flex justify-between border-b border-divider py-1 last:border-0">
              <span>{row.department}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

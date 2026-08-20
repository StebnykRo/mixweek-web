import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { listAdminEvents } from '@/modules/admin/events';
import { NotificationComposer } from '@/components/admin/notification-composer';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

/** docs/10-admin.md §3.7 — compose, estimate reach, test on yourself, send. */
export default async function AdminNotificationsPage() {
  const session = await requirePermission('notification:read');

  const [events, sent] = await Promise.all([
    listAdminEvents(session.tenantId),
    withTenant(session.tenantId, (db) =>
      db.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          kind: true,
          title: true,
          status: true,
          channels: true,
          sentAt: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
      }),
    ),
  ]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <NotificationComposer events={events.map((event) => ({ id: event.id, title: event.title }))} />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg">Recent</h2>
        <ul className="flex flex-col gap-1.5">
          {sent.map((notification) => (
            <li key={notification.id} className="rounded-md bg-surface px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{notification.title}</span>
                <Badge tone={notification.status === 'SENT' ? 'success' : notification.status === 'FAILED' ? 'danger' : 'neutral'}>
                  {notification.status}
                </Badge>
              </div>
              <p className="text-xs text-ink-muted">
                {notification.kind} · {notification.channels.join(', ')} · {notification._count.deliveries} deliveries
                {notification.sentAt
                  ? ` · ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(notification.sentAt)}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
        {sent.length === 0 ? (
          <p className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">Nothing sent yet.</p>
        ) : null}
      </section>
    </div>
  );
}

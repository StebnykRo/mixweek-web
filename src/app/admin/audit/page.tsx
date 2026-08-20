import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Audit log' };

/** docs/10-admin.md §3.13 — read-only history with the sensitive fields masked. */
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await requirePermission('audit:read');
  const { action } = await searchParams;

  const entries = await withTenant(session.tenantId, (db) =>
    db.auditLog.findMany({
      where: action ? { action: { startsWith: action } } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorRole: true,
        diff: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl">Audit log</h1>

      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-md bg-surface px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono font-semibold">{entry.action}</span>
              <span className="text-xs text-ink-muted">
                {new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'medium' }).format(entry.createdAt)}
              </span>
            </div>
            <p className="text-xs text-ink-muted">
              {entry.actor?.name ?? entry.actor?.email ?? 'system'}
              {entry.actorRole ? ` (${entry.actorRole})` : ''}
              {entry.entityType ? ` · ${entry.entityType} ${entry.entityId ?? ''}` : ''}
            </p>
            {entry.diff ? (
              <pre className="mt-1 overflow-x-auto rounded-sm bg-bg p-2 text-[11px]">
                {JSON.stringify(entry.diff, null, 0)}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>

      {entries.length === 0 ? (
        <p className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">Nothing recorded yet.</p>
      ) : null}
    </div>
  );
}

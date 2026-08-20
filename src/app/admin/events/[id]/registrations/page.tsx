import { requirePermission } from '@/modules/admin/guard';
import { listRegistrations, registrationSummary } from '@/modules/admin/registrations';
import { RegistrationsTable } from '@/components/admin/registrations-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Registrations' };

/** docs/10-admin.md §3.5 — filters, bulk actions and the audited CSV export. */
export default async function AdminRegistrationsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('registration:read');
  const { id } = await params;

  const [page, summary] = await Promise.all([
    listRegistrations(session.tenantId, id, { limit: 50 }),
    registrationSummary(session.tenantId, id),
  ]);

  return (
    <RegistrationsTable
      eventId={id}
      summary={summary}
      canWrite={session.role !== 'SUPPORT' && session.role !== 'CONTENT_EDITOR'}
      rows={page.items.map((row) => ({
        id: row.id,
        status: row.status,
        waitlistPosition: row.waitlistPosition,
        name: row.user?.name ?? '—',
        email: row.user?.email ?? '(anonymised)',
        department: row.user?.department ?? '—',
        checkedIn: row.checkedInAt !== null,
        createdAt: row.createdAt.toISOString(),
        answers: (row.answers ?? {}) as Record<string, unknown>,
      }))}
    />
  );
}

import { requirePermission } from '@/modules/admin/guard';
import { listAdminEvents } from '@/modules/admin/events';
import { eventPhase } from '@/modules/events/time';
import { CheckInScanner } from '@/components/admin/check-in-scanner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Check-in' };

/** docs/10-admin.md §3.5 — the mobile scanner, with an offline queue. */
export default async function CheckInPage() {
  const session = await requirePermission('registration:write');
  const events = await listAdminEvents(session.tenantId);
  const candidates = events.filter((event) => eventPhase(event) !== 'past' && event.status === 'PUBLISHED');

  return <CheckInScanner events={candidates.map((event) => ({ id: event.id, title: event.title }))} />;
}

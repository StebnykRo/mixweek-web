import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { getAdminEvent } from '@/modules/admin/events';
import { findPlaceConflicts } from '@/modules/admin/programme';
import { ProgrammeEditor } from '@/components/admin/programme-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Programme' };

/** docs/10-admin.md §3.3 — the programme table, conflicts and the announce banner. */
export default async function AdminProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('programme:read');
  const { id } = await params;
  const event = await getAdminEvent(session.tenantId, id);

  const [activities, places, conflicts] = await Promise.all([
    withTenant(session.tenantId, (db) =>
      db.activity.findMany({
        where: { eventId: id, deletedAt: null },
        orderBy: [{ startsAt: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          title: true,
          track: true,
          startsAt: true,
          endsAt: true,
          status: true,
          isFeatured: true,
          bookingRequired: true,
          capacity: true,
          placeId: true,
          announcedAt: true,
        },
      }),
    ),
    withTenant(session.tenantId, (db) =>
      db.place.findMany({ where: { eventId: id, deletedAt: null }, select: { id: true, name: true } }),
    ),
    findPlaceConflicts(session.tenantId, id),
  ]);

  return (
    <ProgrammeEditor
      eventId={id}
      timezone={event.timezone}
      published={event.status === 'PUBLISHED'}
      places={places}
      conflicts={conflicts}
      activities={activities.map((activity) => ({
        ...activity,
        startsAt: activity.startsAt.toISOString(),
        endsAt: activity.endsAt.toISOString(),
        announced: activity.announcedAt !== null,
      }))}
    />
  );
}

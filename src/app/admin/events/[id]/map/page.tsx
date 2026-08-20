import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { MapEditor } from '@/components/admin/map-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Map' };

/** docs/10-admin.md §3.4 — upload a plan, drop pins by clicking. */
export default async function AdminMapPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('place:read');
  const { id } = await params;

  const places = await withTenant(session.tenantId, (db) =>
    db.place.findMany({
      where: { eventId: id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, kind: true, mapX: true, mapY: true, imageUrl: true, openingHours: true },
    }),
  );

  return <MapEditor eventId={id} places={places} />;
}

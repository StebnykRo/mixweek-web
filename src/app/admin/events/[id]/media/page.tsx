import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { MediaManager } from '@/components/admin/media-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Media' };

/** docs/10-admin.md §3.6 — link cards, covers, ordering and "tell participants". */
export default async function AdminMediaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('media:read');
  const { id } = await params;

  const items = await withTenant(session.tenantId, (db) =>
    db.mediaLink.findMany({
      where: { eventId: id, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        kind: true,
        title: true,
        url: true,
        coverUrl: true,
        status: true,
        authorName: true,
        acceptsUploads: true,
      },
    }),
  );

  return <MediaManager eventId={id} items={items} />;
}

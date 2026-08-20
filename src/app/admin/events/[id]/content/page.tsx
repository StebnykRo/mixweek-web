import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { ContentEditor } from '@/components/admin/content-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Content' };

/** docs/10-admin.md §3 — EventStyle, Travel, Help and FAQ, all Markdown. */
export default async function AdminContentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('content:read');
  const { id } = await params;

  const blocks = await withTenant(session.tenantId, (db) =>
    db.contentBlock.findMany({
      where: { eventId: id, deletedAt: null },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, section: true, key: true, title: true, body: true, sortOrder: true, isPublished: true },
    }),
  );

  return <ContentEditor eventId={id} blocks={blocks} />;
}

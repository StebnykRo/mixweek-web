import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { MediaReportsQueue } from '@/components/admin/media-reports-queue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Media reports' };

/** docs/10-admin.md §3.12b — the complaints queue for external galleries. */
export default async function MediaReportsPage() {
  const session = await requirePermission('media_report:read');

  const reports = await withTenant(session.tenantId, (db) =>
    db.mediaReport.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, mediaLinkId: true, reason: true, comment: true, status: true, createdAt: true },
    }),
  );

  const links = await withTenant(session.tenantId, (db) =>
    db.mediaLink.findMany({
      where: { id: { in: reports.map((report) => report.mediaLinkId) } },
      select: { id: true, title: true, url: true },
    }),
  );
  const linkIndex = new Map(links.map((link) => [link.id, link]));

  return (
    <MediaReportsQueue
      reports={reports.map((report) => ({
        id: report.id,
        reason: report.reason,
        comment: report.comment,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
        mediaTitle: linkIndex.get(report.mediaLinkId)?.title ?? '(removed)',
        mediaUrl: linkIndex.get(report.mediaLinkId)?.url ?? '',
      }))}
    />
  );
}

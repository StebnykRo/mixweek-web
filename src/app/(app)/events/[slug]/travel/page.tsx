import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { PageHeader } from '@/components/patterns/page-header';
import { ContentSections } from '@/components/patterns/content-sections';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Travel' };

/** docs/07-screens.md §13 — flights, transfers, hotel, documents. */
export default async function TravelPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const event = await requireEvent(session.tenantId, slug);
  const t = await getTranslations('travel');

  const blocks = await withTenant(session.tenantId, (db) =>
    db.contentBlock.findMany({
      where: { eventId: event.id, section: 'TRAVEL', isPublished: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, body: true, icon: true },
    }),
  );

  return (
    <>
      <PageHeader title={t('title')} kicker={event.title} backHref={`/events/${event.slug}`} />
      <div className="px-4 pb-8 lg:max-w-3xl lg:px-8">
        <ContentSections blocks={blocks} emptyTitle={t('title')} />
      </div>
    </>
  );
}

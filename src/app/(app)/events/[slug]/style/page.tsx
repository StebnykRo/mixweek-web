import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { PageHeader } from '@/components/patterns/page-header';
import { ContentSections } from '@/components/patterns/content-sections';
import { ChecklistBlock } from '@/components/patterns/checklist-block';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'EventStyle' };

/** docs/07-screens.md §12 — dress code, rules and the packing checklist. */
export default async function StylePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const tenantId = session.tenantId;
  const event = await requireEvent(tenantId, slug);
  const t = await getTranslations('style');

  const [blocks, items, states] = await withTenant(tenantId, (db) =>
    Promise.all([
      db.contentBlock.findMany({
        where: { eventId: event.id, section: 'EVENT_STYLE', isPublished: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, body: true, icon: true },
      }),
      db.checklistItem.findMany({
        where: { eventId: event.id, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, label: true },
      }),
      db.checklistState.findMany({
        where: { userId: session.userId, item: { eventId: event.id } },
        select: { itemId: true, checked: true },
      }),
    ]),
  );

  const checked = new Set(states.filter((state) => state.checked).map((state) => state.itemId));

  return (
    <>
      <PageHeader title={t('title')} kicker={event.title} backHref={`/events/${event.slug}`} />
      <div className="flex flex-col gap-5 px-4 pb-8 lg:max-w-3xl lg:px-8">
        <ContentSections blocks={blocks} emptyTitle={t('title')} />
        {items.length > 0 ? (
          <ChecklistBlock items={items.map((item) => ({ ...item, checked: checked.has(item.id) }))} />
        ) : null}
      </div>
    </>
  );
}

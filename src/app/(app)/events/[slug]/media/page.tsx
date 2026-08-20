import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { listPublishedMedia } from '@/modules/media/service';
import { PageHeader } from '@/components/patterns/page-header';
import { MediaLinkCard } from '@/components/patterns/media-link-card';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Photos and materials' };

/** docs/08-media.md §5 — grouped by kind, in a fixed order. */
export default async function MediaPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const tenantId = session.tenantId;
  const event = await requireEvent(tenantId, slug);

  const [t, locale, media] = await Promise.all([
    getTranslations('media'),
    getLocale(),
    listPublishedMedia(tenantId, event.id),
  ]);

  return (
    <>
      <PageHeader title={t('title')} kicker={event.title} backHref={`/events/${event.slug}`} />

      <div className="px-4 pb-8 lg:px-8">
        {media.total === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <div className="flex flex-col gap-8">
            {media.groups.map((group) => (
              <section key={group.kind}>
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">
                  {t(`groups.${group.kind}` as never)}
                </h2>
                <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <MediaLinkCard
                        id={item.id}
                        title={item.title}
                        description={item.description}
                        url={item.url}
                        coverUrl={item.coverUrl}
                        kind={item.kind}
                        authorName={item.authorName}
                        accessNote={item.accessNote}
                        acceptsUploads={item.acceptsUploads}
                        itemCountHint={item.itemCountHint}
                        addedBy={item.authorName}
                        addedOn={
                          item.publishedAt
                            ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(item.publishedAt)
                            : ''
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

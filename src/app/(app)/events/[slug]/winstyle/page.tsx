import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { isFeatureEnabled } from '@/modules/tenancy/settings';
import { getMyOrder, listProducts } from '@/modules/merch/service';
import { PageHeader } from '@/components/patterns/page-header';
import { WinStyleGrid } from '@/components/patterns/winstyle';
import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WinStyle' };

export default async function WinStylePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const tenantId = session.tenantId;
  const event = await requireEvent(tenantId, slug);

  const [t, locale, enabled] = await Promise.all([
    getTranslations('winstyle'),
    getLocale(),
    isFeatureEnabled('module.winstyle', { tenantId, eventId: event.id }),
  ]);

  if (!enabled) {
    return (
      <>
        <PageHeader title={t('title')} kicker={event.title} backHref={`/events/${event.slug}`} />
        <div className="px-4 lg:px-8">
          <EmptyState title={t('empty')} />
        </div>
      </>
    );
  }

  const [products, order, pickupPlace] = await Promise.all([
    listProducts(tenantId, event.id),
    getMyOrder(tenantId, event.id, session.userId),
    withTenant(tenantId, (db) =>
      db.place.findFirst({ where: { eventId: event.id, kind: 'MERCH', deletedAt: null }, select: { name: true } }),
    ),
  ]);

  return (
    <>
      <PageHeader
        title={t('title')}
        kicker={event.title}
        subtitle={pickupPlace ? t('pickup', { place: pickupPlace.name }) : null}
        backHref={`/events/${event.slug}`}
      />

      <div className="flex flex-col gap-5 px-4 pb-8 lg:px-8">
        {order ? (
          <Card className="p-5">
            <p className="font-semibold">{t('orderNumber', { number: order.number })}</p>
            <ul className="mt-2 text-sm text-ink-muted">
              {order.items.map((item) => (
                <li key={`${item.variant.product.name}-${item.variant.size}`}>
                  {item.variant.product.name} · {item.variant.size} × {item.quantity}
                </li>
              ))}
            </ul>
            <Link
              href={`/events/${event.slug}/winstyle/order`}
              className="mt-3 inline-block font-semibold text-primary-700 underline"
            >
              {t('showQr')}
            </Link>
          </Card>
        ) : null}

        {products.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <WinStyleGrid
            eventSlug={event.slug}
            products={products.map((product) => ({
              id: product.id,
              name: product.name,
              description: product.description,
              imageUrl: product.imageUrl,
              priceCents: product.priceCents,
              currency: product.currency,
              perUserLimit: product.perUserLimit,
              variants: product.variants.map((variant) => ({
                id: variant.id,
                size: variant.size,
                available: variant.available,
              })),
            }))}
            alreadyOrdered={order !== null}
            locale={locale}
          />
        )}
      </div>
    </>
  );
}

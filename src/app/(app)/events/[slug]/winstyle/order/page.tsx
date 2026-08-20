import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { getMyOrder } from '@/modules/merch/service';
import { PageHeader } from '@/components/patterns/page-header';
import { PickupQr } from '@/components/patterns/pickup-qr';
import { EmptyState } from '@/components/ui/empty-state';
import { CancelOrderButton } from '@/components/patterns/cancel-order-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My order' };

export default async function OrderPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const event = await requireEvent(session.tenantId, slug);
  const [t, order] = await Promise.all([
    getTranslations('winstyle'),
    getMyOrder(session.tenantId, event.id, session.userId),
  ]);

  return (
    <>
      <PageHeader title={t('myOrder')} kicker={event.title} backHref={`/events/${event.slug}/winstyle`} />
      <div className="flex flex-col gap-5 px-4 pb-8 lg:max-w-md lg:px-8">
        {order ? (
          <>
            <p className="font-display text-2xl">{t('orderNumber', { number: order.number })}</p>
            <ul className="rounded-md bg-surface p-4 text-sm">
              {order.items.map((item) => (
                <li key={`${item.variant.product.name}-${item.variant.size}`} className="py-1">
                  {item.variant.product.name} · {item.variant.size} × {item.quantity}
                </li>
              ))}
            </ul>
            <PickupQr endpoint={`/orders/${order.id}/pickup-token`} title={t('showQr')} />
            {order.status === 'RESERVED' ? <CancelOrderButton orderId={order.id} /> : null}
          </>
        ) : (
          <EmptyState title={t('empty')} />
        )}
      </div>
    </>
  );
}

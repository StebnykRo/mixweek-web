'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiCallError, idempotencyKey } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/providers/toast-provider';

export type ProductView = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  currency: string;
  perUserLimit: number;
  variants: Array<{ id: string; size: string; available: number }>;
};

export type WinStyleProps = {
  eventSlug: string;
  products: ProductView[];
  alreadyOrdered: boolean;
  locale: string;
};

/** docs/07-screens.md §11 — reserve and collect. No payment anywhere in v1. */
export function WinStyleGrid({ eventSlug, products, alreadyOrdered, locale }: WinStyleProps) {
  const t = useTranslations('winstyle');
  const tc = useTranslations('common');
  const toast = useToast();
  const router = useRouter();

  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  async function reserve(product: ProductView) {
    const variantId = sizes[product.id] ?? product.variants.find((variant) => variant.available > 0)?.id;
    if (!variantId) return;

    setPending(product.id);
    try {
      await api(`/events/${eventSlug}/orders`, {
        method: 'POST',
        body: { items: [{ variantId, quantity: 1 }] },
        idempotencyKey: idempotencyKey(`order:${eventSlug}:${variantId}`),
      });
      toast.show(t('reserved'), 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : tc('errorTitle'), 'error');
    } finally {
      setPending(null);
    }
  }

  return (
    <ul className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {products.map((product) => {
        const chosen = sizes[product.id] ?? product.variants.find((variant) => variant.available > 0)?.id ?? null;
        const anyAvailable = product.variants.some((variant) => variant.available > 0);

        return (
          <li key={product.id} className="flex flex-col overflow-hidden rounded-lg bg-surface shadow-sm">
            <div className="relative aspect-square bg-neutral-200">
              {product.imageUrl ? (
                <Image src={product.imageUrl} alt="" fill sizes="(min-width:1024px) 25vw, 50vw" className="object-cover" />
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <p className="font-semibold leading-tight">{product.name}</p>
              <p className="text-xs text-ink-muted">
                {product.priceCents === 0
                  ? tc('yes') === 'Yes'
                    ? 'Free'
                    : ''
                  : new Intl.NumberFormat(locale, { style: 'currency', currency: product.currency }).format(
                      product.priceCents / 100,
                    )}
              </p>

              <div className="flex flex-wrap gap-1">
                {product.variants.map((variant) => (
                  <Chip
                    key={variant.id}
                    selected={chosen === variant.id}
                    disabled={variant.available === 0}
                    className="h-9 px-3 text-xs disabled:opacity-40"
                    onClick={() => setSizes((current) => ({ ...current, [product.id]: variant.id }))}
                  >
                    {variant.size}
                  </Chip>
                ))}
              </div>

              <div className="mt-auto pt-2">
                {alreadyOrdered ? (
                  <Badge tone="success">{t('reserved')}</Badge>
                ) : anyAvailable ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    full
                    loading={pending === product.id}
                    onClick={() => reserve(product)}
                  >
                    {t('reserve')}
                  </Button>
                ) : (
                  <Badge tone="neutral">{t('outOfStock')}</Badge>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

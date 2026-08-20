'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';

export type PickupQrProps = {
  /** Either an order id (pickup) or an event slug (check-in). */
  endpoint: string;
  offlineCode?: string | null;
  title: string;
};

/**
 * docs/06-events.md §4.6 — the QR carries a 60-second signed token and is
 * refreshed every 30 s, so a screenshot is useless a minute later.
 *
 * Offline the token cannot be fetched by definition, so the static fallback
 * code is shown instead — it is computed from data the client already has, not
 * from a cached API response (docs/13 §4).
 */
export function PickupQr({ endpoint, offlineCode, title }: PickupQrProps) {
  const t = useTranslations('winstyle');
  const [svg, setSvg] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ qrSvg: string }>(endpoint);
      setSvg(result.qrSvg);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [endpoint]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface p-5">
      <p className="text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{title}</p>
      {offline ? (
        offlineCode ? (
          <>
            <p className="font-mono text-3xl font-bold tracking-[6px]">{offlineCode}</p>
            <p className="text-xs text-ink-muted">Show this code at the desk.</p>
          </>
        ) : (
          <p className="text-sm text-ink-muted">{t('showQr')}</p>
        )
      ) : svg ? (
        <div className="w-[220px]" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <Skeleton className="h-[220px] w-[220px]" />
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { drainOfflineQueue, drainWithRetries } from '@/lib/offline-queue';

/**
 * Registers the service worker and handles updates.
 *
 * docs/13-nfr.md §4 — a new version never takes over silently: the person is
 * asked, so an unsaved registration form is not lost mid-typing.
 */
export function ServiceWorkerBridge() {
  const t = useTranslations('common');
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registration = reg;
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) setWaiting(installing);
          });
        });
      })
      .catch(() => undefined);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DRAIN_OFFLINE_QUEUE') void drainOfflineQueue();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    // Belt and braces: Background Sync is not everywhere, so the queue also
    // drains when the connection returns — with retries, because the event can
    // fire a moment before the network is actually usable.
    const onOnline = () => void drainWithRetries();
    window.addEventListener('online', onOnline);
    void drainOfflineQueue();

    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      window.removeEventListener('online', onOnline);
      void registration;
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-40 mx-auto flex w-[min(92vw,420px)] items-center justify-between gap-3 rounded-md bg-neutral-900 px-4 py-3 text-sm text-neutral-50 shadow-lg lg:bottom-6"
    >
      <span>A new version is available</span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          waiting.postMessage('SKIP_WAITING');
          window.location.reload();
        }}
      >
        {t('retry')}
      </Button>
    </div>
  );
}

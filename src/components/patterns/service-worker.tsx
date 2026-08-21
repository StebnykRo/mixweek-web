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
 *
 * With one exception. After a deploy, a client holding old assets can ask for
 * a JavaScript chunk that no longer exists; the route then fails to render and
 * the person is left looking at an empty screen with a polite notice they have
 * no reason to trust. Nothing can be lost from a page that did not load, so in
 * that case the update is taken immediately and the page reloaded — once, or a
 * genuine failure would become a reload loop.
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

    /** A missing chunk means the assets on this device are out of date. */
    const isStaleAssetError = (reason: unknown): boolean => {
      const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? '');
      return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
        message,
      );
    };

    const RELOAD_GUARD = 'mw.sw-reloaded';

    const recover = async (reason: unknown) => {
      if (!isStaleAssetError(reason)) return;
      // One attempt per tab. If the new assets are broken too, the person sees
      // the real error rather than an endless refresh.
      if (sessionStorage.getItem(RELOAD_GUARD)) return;
      sessionStorage.setItem(RELOAD_GUARD, '1');

      try {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.waiting?.postMessage('SKIP_WAITING');
        await reg?.update();
      } catch {
        // Reload anyway: the browser cache alone may be what is stale.
      }
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => void recover(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => void recover(event.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

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
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
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

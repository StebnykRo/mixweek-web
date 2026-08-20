'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { WifiOff } from 'lucide-react';

/**
 * docs/07-screens.md §16 — the offline banner sits above the content and states
 * how old the data is. It never covers the navigation.
 */
export function OfflineBanner() {
  const t = useTranslations('common');
  const [offline, setOffline] = useState(false);
  const [since, setSince] = useState<string>('');

  useEffect(() => {
    const update = () => {
      const isOffline = !navigator.onLine;
      if (isOffline && !offline) {
        setSince(new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date()));
      }
      setOffline(isOffline);
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [offline]);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-xs font-semibold text-neutral-900"
    >
      <WifiOff size={16} aria-hidden="true" />
      {t('offlineBanner', { time: since })}
    </div>
  );
}

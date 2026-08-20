'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

/** docs/07-screens.md §16 — an error boundary per section, never a blank screen. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('common');

  useEffect(() => {
    // The digest is the only handle we get on the server-side error; the detail
    // stays in the server log with its requestId.
    if (process.env.NODE_ENV !== 'production') console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl">{t('errorTitle')}</h1>
      <p className="text-[15px] text-ink-muted">{t('errorBody')}</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-12 items-center rounded-pill bg-primary-500 px-6 font-semibold text-neutral-50"
      >
        {t('retry')}
      </button>
    </main>
  );
}

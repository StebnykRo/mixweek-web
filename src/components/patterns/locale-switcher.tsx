'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { LOCALE_COOKIE, LOCALE_LABELS, isLocale, type Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';

/** docs/13 §5 — the choice is stored on the server, so it follows the person. */
export function LocaleSwitcher({ current, available }: { current: string; available: string[] }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const locales = available.filter(isLocale) as Locale[];

  async function choose(locale: Locale) {
    setValue(locale);
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    try {
      await api('/me', { method: 'PATCH', body: { locale } });
    } finally {
      router.refresh();
    }
  }

  return (
    <div role="radiogroup" aria-label="Language" className="flex flex-wrap gap-2">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          role="radio"
          aria-checked={value === locale}
          onClick={() => void choose(locale)}
          className={cn(
            'inline-flex h-11 items-center rounded-pill border px-4 text-sm font-semibold',
            value === locale ? 'border-primary-500 bg-primary-500 text-neutral-50' : 'border-divider bg-surface',
          )}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** docs/07-screens.md §16 — one screen for 404 and 403, so neither reveals the other. */
export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl">{t('notFoundTitle')}</h1>
      <p className="text-[15px] text-ink-muted">{t('notFoundBody')}</p>
      <Link
        href="/events"
        className="inline-flex h-12 items-center rounded-pill bg-primary-500 px-6 font-semibold text-neutral-50"
      >
        {t('goHome')}
      </Link>
    </main>
  );
}

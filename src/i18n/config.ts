/** docs/13-nfr.md §5 — v1 locales. The per-tenant subset lives in Tenant.locales. */
export const LOCALES = ['en', 'ru', 'uk'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'mw.locale';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  uk: 'Українська',
};

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function pickLocale(preferred: string | null | undefined, allowed: readonly string[] = LOCALES): Locale {
  if (isLocale(preferred) && allowed.includes(preferred)) return preferred;
  const fallback = allowed.find(isLocale);
  return fallback ?? DEFAULT_LOCALE;
}

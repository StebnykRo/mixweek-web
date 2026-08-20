import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config';
import { getSession } from '@/lib/http/context';

/**
 * Locale resolution: the signed-in user's stored preference wins, then the
 * cookie set by the switcher, then Accept-Language, then English.
 * A missing translation falls back and logs — never an empty string
 * (docs/13 §5).
 */
async function resolveLocale(): Promise<Locale> {
  const session = await getSession().catch(() => null);
  if (session && isLocale(session.user.locale)) return session.user.locale;

  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;
  return {
    locale,
    messages,
    timeZone: 'UTC',
    onError(error) {
      if (process.env.NODE_ENV !== 'production') console.warn('[i18n]', error.message);
    },
    getMessageFallback({ namespace, key }) {
      return [namespace, key].filter(Boolean).join('.');
    },
  };
});

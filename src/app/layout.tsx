import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { getBrandForRequest, getNonce } from '@/lib/brand-context';
import { brandToCssVars, safeFontStylesheetUrl, sanitiseCustomCss } from '@/modules/branding/tokens';
import { QueryProvider } from '@/components/providers/query-provider';
import { ToastProvider } from '@/components/providers/toast-provider';
import { OfflineBanner } from '@/components/patterns/offline-banner';
import { ServiceWorkerBridge } from '@/components/patterns/service-worker';
import '@/styles/globals.css';

/** The status-bar colour follows the active brand, like everything else. */
export async function generateViewport(): Promise<Viewport> {
  const brand = await getBrandForRequest();
  return {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: brand.tokens.colors.bg,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrandForRequest();
  return {
    title: { default: brand.appName, template: `%s · ${brand.appName}` },
    description: 'Corporate event platform',
    manifest: '/manifest.webmanifest',
    icons: brand.logoMarkUrl ? { icon: brand.logoMarkUrl, apple: brand.logoMarkUrl } : undefined,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: brand.appName },
    robots: process.env.NODE_ENV === 'production' ? undefined : { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [brand, nonce, locale, messages] = await Promise.all([
    getBrandForRequest(),
    getNonce(),
    getLocale(),
    getMessages(),
  ]);

  // docs/04 §3.2 — tokens are rendered server-side, so there is no flash of the
  // default theme. brandToCssVars only ever emits allow-listed pairs.
  const cssVars = brandToCssVars(brand.tokens);
  const customCss = sanitiseCustomCss(brand.customCss);
  const fontHref = safeFontStylesheetUrl(brand.tokens);

  return (
    <html lang={locale} data-brand={brand.key} suppressHydrationWarning>
      <head>
        {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
        {/*
          The nonce is stripped from the DOM by the browser once the policy has
          been checked, so React sees nonce="" on the client and would report a
          mismatch it cannot patch. suppressHydrationWarning is the sanctioned
          way to say "this attribute is expected to differ".
        */}
        <style
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `:root{${cssVars}}${customCss ? `:root{${customCss}}` : ''}`,
          }}
        />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            <ToastProvider>
              <OfflineBanner />
              {children}
              <ServiceWorkerBridge />
            </ToastProvider>
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

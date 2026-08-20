import { NextResponse } from 'next/server';
import { getBrandForRequest } from '@/lib/brand-context';

export const dynamic = 'force-dynamic';

/**
 * GET /manifest.webmanifest
 *
 * docs/13-nfr.md §4 — generated per tenant, so an installed PWA carries the
 * right name, icon and colours for the company the person belongs to.
 */
export async function GET(): Promise<NextResponse> {
  const brand = await getBrandForRequest();
  const icon = brand.logoMarkUrl ?? '/icons/icon-512.png';

  return NextResponse.json(
    {
      name: brand.appName,
      short_name: brand.appName.slice(0, 12),
      description: 'Corporate event platform',
      start_url: '/events?source=pwa',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: brand.tokens.colors.bg,
      theme_color: brand.tokens.colors.primary[500],
      icons: [
        { src: icon, sizes: '192x192', type: 'image/png' },
        { src: icon, sizes: '512x512', type: 'image/png' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'Programme', url: '/events?shortcut=programme' },
        { name: 'Map', url: '/events?shortcut=map' },
      ],
    },
    {
      headers: {
        'content-type': 'application/manifest+json',
        'cache-control': 'private, max-age=300',
        vary: 'Cookie',
      },
    },
  );
}

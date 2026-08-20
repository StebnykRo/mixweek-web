import createNextIntlPlugin from 'next-intl/plugin';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Required by the runtime stage of the Dockerfile.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: { ignoreDuringBuilds: true },
  images: {
    formats: ['image/avif', 'image/webp'],
    // docs/05 §7 — explicit allowlist. No arbitrary remote images.
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.mixweek.app' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'localhost' },
    ],
  },
  serverExternalPackages: ['sharp', '@node-rs/argon2', 'ioredis', 'bullmq', 'pino', 'web-push'],
  experimental: { optimizePackageImports: ['lucide-react'] },
  async headers() {
    return [
      {
        // The offline shell is precached by the service worker, so it must not
        // be marked no-store — nothing personal is on it (docs/13 §4).
        source: '/offline',
        headers: [{ key: 'cache-control', value: 'public, max-age=3600, must-revalidate' }],
      },
      {
        // The service worker is outside the middleware matcher (see
        // src/middleware.ts), so its security headers are set here. It needs a
        // policy it can actually satisfy: no nonce is possible for a worker.
        source: '/sw.js',
        headers: [
          { key: 'content-type', value: 'application/javascript; charset=utf-8' },
          { key: 'cache-control', value: 'public, max-age=0, must-revalidate' },
          { key: 'service-worker-allowed', value: '/' },
          { key: 'x-content-type-options', value: 'nosniff' },
          { key: 'content-security-policy', value: "default-src 'self'; script-src 'self'; connect-src 'self'" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(config);

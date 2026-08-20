import { NextResponse, type NextRequest } from 'next/server';

/**
 * docs/12-security.md §3 — security headers on every response, and a per-request
 * CSP nonce. No `unsafe-inline`, no `unsafe-eval`, anywhere.
 */

export const config = {
  // sw.js is excluded deliberately: a service worker script is governed by the
  // CSP of its own response, and `script-src 'strict-dynamic'` with a nonce
  // blocks a worker that cannot carry one. It gets its own headers below.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|icons/).*)'],
};

/** frame-src stays 'none' by default; the two feature flags below widen it to
 *  fixed, code-defined origins. A tenant can never extend the policy itself. */
const FRAME_SRC_BY_FEATURE = {
  'map.google': ['https://www.google.com/maps/embed/'],
  'media.embed': ['https://www.youtube-nocookie.com', 'https://player.vimeo.com'],
} as const;

function buildCsp(nonce: string, options: { isAdmin: boolean; isDev: boolean; frameSrc: string[] }): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  // Next.js dev tooling evaluates its HMR client; production never does.
  if (options.isDev) scriptSrc.push("'unsafe-eval'");

  const frameSrc = options.frameSrc.length > 0 ? options.frameSrc : ["'none'"];
  if (options.isAdmin) frameSrc.push("'self'"); // brand preview iframe (docs/12 §3)

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // docs/12 §3 — style elements stay nonce-only: an injected <style> could
    // restyle the page into a convincing phishing surface.
    //
    // `style-src-attr` is scoped to the style="" attribute, which React needs
    // for genuinely dynamic values — map-pin coordinates, capacity bar widths,
    // brand logo sizing. React escapes those values and an attribute cannot
    // introduce script, so this does not reopen the XSS path that
    // `unsafe-inline` on style-src as a whole would.
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self'",
    `frame-src ${frameSrc.join(' ')}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
    'report-uri /api/csp-report',
  ].join('; ');
}

export function securityHeaders(nonce: string, options: { isAdmin: boolean; isDev: boolean; frameSrc?: string[] }) {
  return {
    'content-security-policy': buildCsp(nonce, {
      isAdmin: options.isAdmin,
      isDev: options.isDev,
      frameSrc: options.frameSrc ?? [],
    }),
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy':
      'camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-site',
    'cross-origin-embedder-policy': 'credentialless',
  } as const;
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const requestId = `req_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const isAdmin = request.nextUrl.pathname.startsWith('/admin');
  const isDev = process.env.NODE_ENV === 'development';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  for (const [key, value] of Object.entries(securityHeaders(nonce, { isAdmin, isDev }))) {
    response.headers.set(key, value);
  }
  response.headers.set('x-request-id', requestId);

  // Lower environments stay out of search indexes (docs/01 §2).
  if ((process.env.APP_ENV ?? process.env.NODE_ENV) !== 'production') {
    response.headers.set('x-robots-tag', 'noindex, nofollow');
  }

  // The admin panel is never cached, never indexed.
  if (isAdmin) {
    response.headers.set('cache-control', 'private, no-store');
    response.headers.set('x-robots-tag', 'noindex, nofollow');
  }

  return response;
}

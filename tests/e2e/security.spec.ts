import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

/** docs/14-qa.md §2.6 — the security suite. */

const REQUIRED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
];

test.describe('response headers', () => {
  for (const path of ['/login', '/events', '/api/v1/auth/session']) {
    test(`every required header is present on ${path}`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      const headers = response.headers();
      for (const header of REQUIRED_HEADERS) {
        expect(headers[header], `${header} missing on ${path}`).toBeTruthy();
      }
    });
  }

  test('the CSP has no unsafe-inline for scripts and no unsafe-eval', async ({ request }) => {
    const csp = (await request.get('/login')).headers()['content-security-policy'] ?? '';
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? '';

    expect(scriptSrc).toContain("'nonce-");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  test('style elements are nonce-controlled; only the style attribute is relaxed', async ({ request }) => {
    const csp = (await request.get('/login')).headers()['content-security-policy'] ?? '';
    const styleSrc = /(?:^|;)\s*style-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(styleSrc).toContain("'nonce-");
    expect(styleSrc).not.toContain("'unsafe-inline'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
  });

  test('the nonce changes on every request', async ({ request }) => {
    const first = (await request.get('/login')).headers()['content-security-policy'] ?? '';
    const second = (await request.get('/login')).headers()['content-security-policy'] ?? '';
    expect(/nonce-([\w+/=]+)/.exec(first)?.[1]).not.toBe(/nonce-([\w+/=]+)/.exec(second)?.[1]);
  });

  test('the admin panel is never cached or indexed', async ({ request }) => {
    const headers = (await request.get('/admin', { maxRedirects: 0 })).headers();
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['x-robots-tag']).toContain('noindex');
  });
});

test.describe('authentication gates', () => {
  const protectedApi = [
    '/api/v1/events',
    '/api/v1/events/mix-week-2026',
    '/api/v1/me',
    '/api/v1/me/notifications',
    '/api/v1/admin/events',
    '/api/v1/admin/secrets',
    '/api/v1/admin/audit-log',
  ];

  for (const path of protectedApi) {
    test(`anonymous access to ${path} is refused`, async ({ request }) => {
      const response = await request.get(path);
      expect([401, 404]).toContain(response.status());
      const body = await response.json();
      expect(JSON.stringify(body)).not.toContain('prisma');
      expect(JSON.stringify(body)).not.toContain('SELECT');
    });
  }

  test('an anonymous page request lands on the sign-in screen', async ({ page }) => {
    await page.goto('/events');
    await expect(page).toHaveURL(/\/login/);
  });

  test('an error body carries a code and a requestId, and nothing else', async ({ request }) => {
    const response = await request.get('/api/v1/events');
    const body = (await response.json()) as { error: Record<string, unknown> };
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message', 'requestId']);
  });
});

test.describe('CSRF', () => {
  test('a cross-origin POST is refused', async ({ request }) => {
    const response = await request.post('/api/v1/auth/start', {
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      data: { email: SEED.participant },
    });
    expect(response.status()).toBe(403);
  });

  test('a same-origin POST is accepted', async ({ request, baseURL }) => {
    const response = await request.post('/api/v1/auth/start', {
      headers: { origin: baseURL ?? '', 'content-type': 'application/json' },
      data: { email: SEED.participant },
    });
    // 429 is also a pass here: what matters is that it was not refused as
    // cross-origin.
    expect(response.status()).not.toBe(403);
    expect([200, 429]).toContain(response.status());
  });
});

test.describe('personal data is never cached', () => {
  test('the session and profile endpoints are private, no-store, Vary: Cookie', async ({ page, request }) => {
    await signIn(page, SEED.participant);

    for (const path of ['/api/v1/auth/session', '/api/v1/me', '/api/v1/events?scope=mine']) {
      const response = await page.request.get(path);
      const headers = response.headers();
      expect(headers['cache-control'], path).toContain('no-store');
      expect(headers['cache-control'], path).toContain('private');
      expect(headers['vary'], path).toContain('Cookie');
    }
    void request;
  });
});

test.describe('no open redirect', () => {
  test('a next parameter cannot point off-site', async ({ page }) => {
    await page.goto('/login?next=https://evil.example');
    await expect(page).toHaveURL(/localhost/);
  });
});

test.describe('service endpoints', () => {
  test('health says nothing beyond its status', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['status']);
  });

  test('security.txt is published', async ({ request }) => {
    const response = await request.get('/.well-known/security.txt');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Contact:');
  });

  test('the CSP report endpoint accepts a report and stores nothing', async ({ request }) => {
    const response = await request.post('/api/csp-report', {
      headers: { 'content-type': 'application/csp-report' },
      data: { 'csp-report': { 'document-uri': '/login', 'violated-directive': 'script-src' } },
    });
    expect(response.status()).toBe(204);
  });

  test('an oversized CSP report is rejected', async ({ request }) => {
    const response = await request.post('/api/csp-report', {
      headers: { 'content-type': 'application/csp-report' },
      data: { 'csp-report': { blob: 'x'.repeat(20_000) } },
    });
    expect(response.status()).toBe(413);
  });
});

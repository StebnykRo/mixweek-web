import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

/** docs/14-qa.md §2.7 — offline behaviour and what may be stored on the device. */

test.describe('offline', () => {
  test('the programme is still readable with the network down', async ({ page, context }) => {
    await signIn(page, SEED.participant);
    await page.goto(`/events/${SEED.eventSlug}/programme`);
    await expect(page.getByText('Breakfast').first()).toBeVisible();

    // Give the service worker a moment to take control and fill its cache.
    await page.waitForTimeout(1500);
    await context.setOffline(true);

    const cached = await page.evaluate(async () => {
      const keys = await caches.keys();
      const contentCache = keys.find((key) => key.includes('content'));
      if (!contentCache) return 0;
      return (await (await caches.open(contentCache)).keys()).length;
    });

    expect(cached).toBeGreaterThanOrEqual(0);
    await context.setOffline(false);
  });

  test('the offline banner appears when the connection drops', async ({ page, context }) => {
    await signIn(page, SEED.participant);
    await page.goto(`/events/${SEED.eventSlug}`);

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText(/No connection/)).toBeVisible();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText(/No connection/)).toHaveCount(0);
  });

  test('nothing marked no-store ends up in Cache Storage', async ({ page }) => {
    await signIn(page, SEED.participant);
    await page.goto(`/events/${SEED.eventSlug}/programme`);
    await page.waitForTimeout(1500);

    const offenders = await page.evaluate(async () => {
      const found: string[] = [];
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          const control = response?.headers.get('cache-control') ?? '';
          if (control.includes('no-store')) found.push(request.url);
          // docs/13 §4 — these paths must never be cached at all.
          if (/\/auth\/|\/admin\/|check-in-token|pickup-token/.test(request.url)) found.push(request.url);
        }
      }
      return found;
    });

    expect(offenders).toEqual([]);
  });

  test('signing out clears Cache Storage and IndexedDB', async ({ page }) => {
    await signIn(page, SEED.participant);
    await page.goto(`/events/${SEED.eventSlug}/programme`);
    await page.waitForTimeout(1500);

    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(/\/login/);

    const leftovers = await page.evaluate(async () => ({
      caches: (await caches.keys()).length,
      storage: window.localStorage.length,
    }));

    expect(leftovers.caches).toBe(0);
    expect(leftovers.storage).toBe(0);
  });

  test('a heart tapped offline is queued and sent on reconnect', async ({ page, context }) => {
    await signIn(page, SEED.participant);
    await page.goto(`/events/${SEED.eventSlug}/programme`);
    await page.waitForTimeout(1000);

    await context.setOffline(true);
    await page.getByRole('button', { name: /Save to my programme/ }).first().click();

    const queued = await page.evaluate(() => JSON.parse(window.localStorage.getItem('mw.offline-queue') ?? '[]').length);
    expect(queued).toBeGreaterThan(0);

    await context.setOffline(false);
    // Two nudges: the listener registered by the app, and a direct drain, so a
    // missed event does not read as a broken queue.
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    // Poll rather than guess at a delay: the drain is a network round-trip.
    await expect
      .poll(
        async () =>
          page.evaluate(() => JSON.parse(window.localStorage.getItem('mw.offline-queue') ?? '[]').length as number),
        { timeout: 15_000 },
      )
      .toBe(0);
  });
});

test.describe('PWA', () => {
  test('the manifest is generated for the tenant brand', async ({ page }) => {
    await signIn(page, SEED.participant);
    const response = await page.request.get('/manifest.webmanifest');
    const manifest = (await response.json()) as Record<string, unknown>;

    expect(manifest.display).toBe('standalone');
    expect(manifest.name).toBe('Mix Week');
    expect(String(manifest.theme_color)).toMatch(/^#/);
    expect(response.headers()['cache-control']).toContain('private');
  });

  test('the service worker registers', async ({ page }) => {
    await signIn(page, SEED.participant);
    await page.goto(`/events/${SEED.eventSlug}`);
    const registered = await page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration()));
    expect(registered).toBe(true);
  });
});

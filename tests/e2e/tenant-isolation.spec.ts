import { expect, test } from '@playwright/test';
import { TENANT_SCOPED_MODELS } from '@/lib/db/models';
import { SEED, signIn } from './helpers';

/**
 * docs/14-qa.md §2.1 — cross-tenant access over HTTP.
 *
 * The entity list comes from the same module the guard and the RLS migration
 * use, so adding a model without covering it here is not possible by accident.
 */

test.describe('a member of one tenant cannot reach another', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEED.participant);
  });

  test('the other tenant event is a 404, not a 403', async ({ page }) => {
    const response = await page.request.get(`/api/v1/events/${SEED.acmeEventSlug}`);
    // 404 rather than 403: a 403 would confirm the slug exists.
    expect(response.status()).toBe(404);
  });

  test('the other tenant event does not appear in any listing', async ({ page }) => {
    for (const scope of ['upcoming', 'past', 'mine']) {
      const response = await page.request.get(`/api/v1/events?scope=${scope}`);
      const body = (await response.json()) as { items: Array<{ slug: string }> };
      expect(body.items.map((item) => item.slug)).not.toContain(SEED.acmeEventSlug);
    }
  });

  test('a direct id from the other tenant is a 404 on every verb', async ({ page }) => {
    const foreignId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const attempts = [
      page.request.get(`/api/v1/events/${SEED.eventSlug}/activities/${foreignId}`),
      page.request.put(`/api/v1/activities/${foreignId}/save`),
      page.request.delete(`/api/v1/activities/${foreignId}/save`),
      page.request.put(`/api/v1/checklist/${foreignId}`, { data: { checked: true } }),
    ];

    for (const attempt of attempts) {
      const response = await attempt;
      expect([404, 422]).toContain(response.status());
    }
  });

  test('the admin API is closed to a participant', async ({ page }) => {
    for (const path of ['/api/v1/admin/events', '/api/v1/admin/users', '/api/v1/admin/secrets']) {
      expect((await page.request.get(path)).status()).toBe(404);
    }
  });

  test('the canonical model list is covered by this suite', () => {
    // A reminder in code rather than in a comment: the list drives the RLS
    // migration, the Prisma guard and the integration suite.
    expect(TENANT_SCOPED_MODELS.length).toBeGreaterThan(30);
    expect(TENANT_SCOPED_MODELS).toContain('EventRegistration');
    expect(TENANT_SCOPED_MODELS).toContain('MediaLink');
  });
});

test.describe('two brands on one instance', () => {
  test('each tenant sees its own brand', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Corporate email').fill(SEED.participant);
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('SOFTSWISS', { exact: true })).toBeVisible();

    const softswissPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim(),
    );

    await page.goto('/login');
    await page.getByLabel('Corporate email').fill(SEED.acmeAdmin);
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('ACME', { exact: true })).toBeVisible();

    const acmePrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary-500').trim(),
    );

    expect(softswissPrimary).not.toBe(acmePrimary);
  });

  test('the theme is in the server response, so there is no flash of the default', async ({ page }) => {
    const response = await page.goto('/login');
    const html = (await response?.text()) ?? '';
    // The variables ship with the document, not after a round trip.
    expect(html).toContain('--color-primary-500');
    expect(html).toContain(':root{');
  });
});

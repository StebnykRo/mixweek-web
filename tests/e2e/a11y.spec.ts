import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

/**
 * docs/13-nfr.md §2 — axe on twelve key screens, in both viewports.
 * Nothing at `serious` or `critical` is allowed through.
 */

const SIGNED_OUT = ['/login', '/legal/terms', '/legal/privacy'];

const SIGNED_IN = [
  '/events?scope=upcoming&stay=1',
  `/events/${SEED.eventSlug}`,
  `/events/${SEED.eventSlug}/programme`,
  `/events/${SEED.eventSlug}/my`,
  `/events/${SEED.eventSlug}/map`,
  `/events/${SEED.eventSlug}/style`,
  `/events/${SEED.eventSlug}/help`,
  `/events/${SEED.pastEventSlug}/media`,
  '/notifications',
  '/profile',
  '/profile/notifications',
  '/profile/sessions',
];

async function scan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  // Naming the rule and the node makes a failure actionable rather than a count.
  const summary = blocking
    .map((violation) => `${violation.id} (${violation.impact}): ${violation.nodes[0]?.target.join(' ')}`)
    .join('\n');

  expect(blocking, summary).toHaveLength(0);
}

for (const path of SIGNED_OUT) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await scan(page);
  });
}

test.describe('signed in', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, SEED.participant);
  });

  for (const path of SIGNED_IN) {
    test(`no serious accessibility violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await scan(page);
    });
  }
});

test.describe('keyboard and focus', () => {
  test('the focus ring is visible on the sign-in form', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');

    const outline = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return null;
      const style = getComputedStyle(active);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });

    expect(outline?.style).not.toBe('none');
  });

  test('every touch target on the tab bar is at least 44px', async ({ page }) => {
    await signIn(page, SEED.participant);
    await page.goto(`/events/${SEED.eventSlug}`);

    const links = await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link').all();
    for (const link of links) {
      const box = await link.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the page language matches the chosen locale', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('lang', /en|ru|uk/);
  });
});

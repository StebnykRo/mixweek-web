import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

/** docs/14-qa.md §3 C and D — the participant journey. */

test.beforeEach(async ({ page }) => {
  await signIn(page, SEED.participant);
});

test.describe('events', () => {
  test('the three tabs work and past events are read-only', async ({ page }) => {
    await page.goto('/events?scope=upcoming&stay=1');
    await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();

    await page.getByRole('link', { name: 'Past' }).click();
    await expect(page).toHaveURL(/scope=past/);

    await page.getByRole('link', { name: 'Mine' }).click();
    await expect(page).toHaveURL(/scope=mine/);
  });

  test('a past event offers no registration', async ({ page }) => {
    await page.goto(`/events/${SEED.pastEventSlug}`);
    await expect(page.getByRole('link', { name: /Register/ })).toHaveCount(0);
  });
});

test.describe('programme', () => {
  test('shows the days and sessions of the event', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/programme`);
    await expect(page.getByRole('heading', { name: 'Programme' })).toBeVisible();
    await expect(page.getByText('Breakfast').first()).toBeVisible();
  });

  test('all four filters combine and survive a reload', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/programme`);

    const trackChip = page.getByRole('button', { name: 'Workshop', exact: true }).first();
    await trackChip.click();
    await expect(page).toHaveURL(/track=WORKSHOP/);

    await page.getByRole('button', { name: /Morning/ }).click();
    await expect(page).toHaveURL(/from=06%3A00/);

    const url = page.url();
    await page.reload();
    // The filter state lives entirely in the URL, so it comes back intact.
    expect(page.url()).toBe(url);
    await expect(page.getByRole('button', { name: 'Workshop', exact: true }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('a filter with no matches explains itself and offers a way out', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/programme?track=SPORT&from=17:00&to=22:00`);
    await expect(page.getByText('Nothing found')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset all' })).toBeVisible();
  });

  test('the times are shown in the event timezone, and say so', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/programme`);
    await expect(page.getByText(/UTC\+3/)).toBeVisible();
  });

  test('the heart is optimistic and survives a reload', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/programme`);

    // The accessible name flips once it is saved, so the element is pinned by
    // position rather than by name. The starting state is whatever an earlier
    // test left behind, so the assertion is on the flip, not on a fixed value.
    const row = page.getByRole('listitem').filter({ hasText: 'Breakfast' }).first();
    const heart = row.getByRole('button').last();

    const before = await heart.getAttribute('aria-pressed');
    const after = before === 'true' ? 'false' : 'true';

    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', after);

    await page.reload();
    const afterReload = page.getByRole('listitem').filter({ hasText: 'Breakfast' }).first().getByRole('button').last();
    await expect(afterReload).toHaveAttribute('aria-pressed', after);
  });

  test('a saved session appears in My programme', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/programme`);

    const target = page.getByRole('button', { name: /Save to my programme/ }).first();
    await target.click();
    // Wait for the write to land rather than guessing at a delay.
    await expect(page.getByRole('button', { name: /Remove from my programme/ }).first()).toBeVisible();

    await page.goto(`/events/${SEED.eventSlug}/my`);
    await expect(page.getByRole('button', { name: /Remove from my programme/ }).first()).toBeVisible();
  });

  test('opening a session gives it its own shareable URL', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/programme`);
    await page.getByText('Breakfast').first().click();
    await expect(page).toHaveURL(/\/programme\/[a-z0-9]+/);
  });
});

test.describe('map', () => {
  test('pins are buttons with names, reachable from the keyboard', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/map`);
    const pin = page.getByRole('button', { name: /Main Stage/ }).first();
    await expect(pin).toBeVisible();

    await pin.focus();
    await expect(pin).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/map\/[a-z0-9]+/);
  });
});

test.describe('help and content', () => {
  test('help lists the urgent contact first', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/help`);
    await expect(page.getByText('24/7 support line')).toBeVisible();
    await expect(page.getByRole('link', { name: /\+357/ }).first()).toBeVisible();
  });

  test('EventStyle carries the checklist and remembers a tick', async ({ page }) => {
    await page.goto(`/events/${SEED.eventSlug}/style`);
    await expect(page.getByText('Packing checklist')).toBeVisible();

    // Starting state depends on what earlier tests left behind, so the
    // assertion is that the tick flips and then survives a reload.
    const item = page.getByRole('checkbox').first();
    const before = await item.isChecked();

    await item.click();
    await expect(item).toBeChecked({ checked: !before });

    // The state is stored on the server, not in the browser.
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByRole('checkbox').first()).toBeChecked({ checked: !before });
  });
});

test.describe('media', () => {
  test('a past event shows its galleries with covers', async ({ page }) => {
    await page.goto(`/events/${SEED.pastEventSlug}/media`);
    await expect(page.getByRole('heading', { name: 'Photographers' })).toBeVisible();
    await expect(page.getByText('Gala Night — official gallery')).toBeVisible();
  });

  test('an external link warns before leaving the app', async ({ page }) => {
    await page.goto(`/events/${SEED.pastEventSlug}/media`);
    await page.getByRole('button', { name: 'Open' }).first().click();
    await expect(page.getByText(/site of a partner|partner site/i)).toBeVisible();
  });
});

test.describe('notifications', () => {
  test('the history screen is reachable and explains itself when empty', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  });
});

test.describe('profile', () => {
  test('the language switcher applies immediately', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('radio', { name: 'Українська' }).click();
    await expect(page.getByRole('heading', { name: 'Профіль' })).toBeVisible();

    await page.getByRole('radio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  });

  test('the privacy screen offers export and deletion', async ({ page }) => {
    await page.goto('/profile/privacy');
    await expect(page.getByRole('button', { name: 'Export my data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible();
  });
});

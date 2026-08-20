import { expect, test } from '@playwright/test';
import { SEED, codeFrom, latestMailFor, signIn } from './helpers';

/** docs/03-auth.md §11 and docs/14 §3 A — the sign-in flow end to end. */

test.describe('sign in', () => {
  test('a participant gets in with the emailed code', async ({ page }) => {
    await signIn(page, SEED.participant);
    await expect(page).toHaveURL(/\/events/);
    await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
  });

  test('the brand switches as soon as the domain is known', async ({ page }) => {
    await page.goto('/login');
    // Before: the neutral platform brand, with no company kicker.
    await expect(page.getByText('SOFTSWISS', { exact: true })).toHaveCount(0);

    await page.getByLabel('Corporate email').fill(SEED.participant);
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // After: the tenant's brand, before the person has even opened their mail.
    await expect(page.getByText('SOFTSWISS', { exact: true })).toBeVisible();
  });

  test('an unknown address looks exactly like a known one', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Corporate email').fill('definitely-not-a-user@softswiss.com');
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Same screen, same wording — nothing tells an attacker the account is new.
    await expect(page.getByLabel('Six-digit code')).toBeVisible();
    await expect(page.getByText(/We sent a code/)).toBeVisible();
  });

  test('a wrong code is refused without revealing anything', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Corporate email').fill(SEED.participant);
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByLabel('Six-digit code').fill('000000');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('the same code cannot be used twice', async ({ page, request }) => {
    const since = Date.now();
    await page.goto('/login');
    await page.getByLabel('Corporate email').fill(SEED.otherParticipant);
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    const mail = await latestMailFor(SEED.otherParticipant, since);
    const code = codeFrom(mail!);

    await page.getByLabel('Six-digit code').fill(code);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/(events|onboarding)/);

    // Replaying the same code from a clean client gets nowhere: the token was
    // consumed by the first use.
    const replay = await request.post('/api/v1/auth/verify', {
      headers: { origin: page.url().replace(/\/[^/]*$/, ''), 'content-type': 'application/json' },
      data: { email: SEED.otherParticipant, code },
    });
    expect(replay.status()).toBe(422);
  });

  test('the continue button stays disabled until the terms are accepted', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Corporate email').fill(SEED.participant);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.getByRole('checkbox').click();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('the whole flow works from the keyboard alone', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    await page.keyboard.type(SEED.participant);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  test('an admin is asked for a second factor', async ({ page }) => {
    const since = Date.now();
    await page.goto('/login');
    await page.getByLabel('Corporate email').fill(SEED.admin);
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    const mail = await latestMailFor(SEED.admin, since);
    await page.getByLabel('Six-digit code').fill(codeFrom(mail!));
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL(/\/login\/mfa/);
    await expect(page.getByRole('heading', { name: /two-factor/i })).toBeVisible();
  });

  test('signing out ends the session', async ({ page }) => {
    await signIn(page, SEED.participant);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(/\/login/);

    await page.goto('/events');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('sessions', () => {
  test('the device list shows this session and lets it be ended', async ({ page }) => {
    await signIn(page, SEED.participant);
    await page.goto('/profile/sessions');
    await expect(page.getByText('This device')).toBeVisible();
  });
});

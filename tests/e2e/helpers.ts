import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page, APIRequestContext } from '@playwright/test';

/**
 * The dev mail transport writes each message to `.mail/` (see src/lib/mail.ts),
 * which is how the sign-in code reaches these tests without a real inbox.
 */
const MAIL_DIR = join(process.cwd(), '.mail');

export async function latestMailFor(email: string, since = 0): Promise<{ subject: string; text: string } | null> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const files = await readdir(MAIL_DIR);
      const matching = files
        .filter((file) => file.includes(email.replace(/[^a-z0-9]/gi, '_')))
        .filter((file) => Number(file.split('-')[0] ?? 0) >= since)
        .sort();
      const newest = matching.at(-1);
      if (newest) {
        return JSON.parse(await readFile(join(MAIL_DIR, newest), 'utf8')) as { subject: string; text: string };
      }
    } catch {
      // The directory appears with the first message.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

export function codeFrom(mail: { text: string }): string {
  return /Code: (\d{6})/.exec(mail.text)?.[1] ?? '';
}

/** Signs in through the real UI: email, then the six-digit code. */
export async function signIn(page: Page, email: string): Promise<void> {
  const since = Date.now();
  await page.goto('/login');
  await page.getByLabel('Corporate email').fill(email);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByLabel('Six-digit code').waitFor();
  const mail = await latestMailFor(email, since);
  if (!mail) throw new Error(`No sign-in email arrived for ${email}`);

  await page.getByLabel('Six-digit code').fill(codeFrom(mail));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(events|onboarding|login\/mfa)/);

  // A first sign-in lands on onboarding; step through it.
  if (page.url().includes('/onboarding')) {
    for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Full name').fill('Test Person');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.waitForURL(/\/events/);
  }
}

export async function apiGet(request: APIRequestContext, path: string) {
  return request.get(`/api/v1${path}`);
}

export const SEED = {
  participant: 'user1@softswiss.com',
  otherParticipant: 'user2@softswiss.com',
  admin: 'admin@softswiss.com',
  acmeAdmin: 'admin@acme.example',
  eventSlug: 'mix-week-2026',
  pastEventSlug: 'mix-week-2025',
  acmeEventSlug: 'acme-days-2026',
} as const;

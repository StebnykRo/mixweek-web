import { defineConfig, devices } from '@playwright/test';

/**
 * docs/14-qa.md §1 — end-to-end on two viewports, 390×844 and 1440×900,
 * because the mobile layout is the base and the desktop one is a real
 * rearrangement rather than a wider column.
 */
const PORT = Number(process.env.E2E_PORT ?? 3310);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The app is same-origin only; this keeps the CSRF checks honest.
    ignoreHTTPSErrors: false,
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next start --port ${PORT}`,
    url: `${baseURL}/login`,
    // Always start a fresh server: a reused one may have been launched without
    // APP_ENV/RATE_LIMIT_MULTIPLIER, in which case the real rate limits refuse
    // the suite's sign-ins and every test fails for the wrong reason.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      // `next start` forces NODE_ENV=production, so the environment is carried
      // by APP_ENV instead (see src/lib/app-env.ts). The suite needs the
      // file-drop mail transport and cookies that work over plain http.
      APP_ENV: 'e2e',
      // The real limits would block a run that signs in dozens of times from a
      // single address. Ignored outright in production and staging.
      RATE_LIMIT_MULTIPLIER: '50',
    },
  },
});

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { beforeAll, afterAll } from 'vitest';

/**
 * docs/14-qa.md §1 — the integration suite runs against a real Postgres with
 * RLS enabled, connecting as `app_user` exactly like the application does.
 * Testing tenant isolation against a mock would prove nothing.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://app_user:app_user_dev@localhost:5432/mixweek_test?schema=public';
const TEST_DIRECT_URL =
  process.env.TEST_DIRECT_DATABASE_URL ?? 'postgresql://app_admin:app_admin_dev@localhost:5432/mixweek_test?schema=public';

// Next's ambient types mark NODE_ENV read-only; Object.assign sets it without
// fighting the declaration.
Object.assign(process.env, { NODE_ENV: 'test' });
process.env.APP_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_DATABASE_URL = TEST_DIRECT_URL;
process.env.AUTH_SECRET ??= randomBytes(32).toString('base64');
process.env.APP_MASTER_KEY ??= randomBytes(32).toString('base64');
process.env.LOG_LEVEL ??= 'silent';
delete process.env.REDIS_URL;

beforeAll(() => {
  // Migrations run as app_admin; the tests themselves connect as app_user, so
  // the RLS policies are actually in force.
  execSync('npx prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: TEST_DIRECT_URL, DIRECT_DATABASE_URL: TEST_DIRECT_URL },
  });
});

afterAll(async () => {
  const { prisma } = await import('@/lib/db/client');
  await prisma.$disconnect();
});

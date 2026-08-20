import { randomBytes } from 'node:crypto';

/**
 * Unit tests never touch the database or Redis, but src/lib/env.ts fails fast
 * on a missing key — so the bootstrap minimum is provided here.
 */
// Next's ambient types mark NODE_ENV read-only; Object.assign sets it without
// fighting the declaration.
Object.assign(process.env, { NODE_ENV: 'test' });
process.env.APP_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgresql://app_user:app_user_dev@localhost:5432/mixweek_test?schema=public';
process.env.AUTH_SECRET ??= randomBytes(32).toString('base64');
process.env.APP_MASTER_KEY ??= randomBytes(32).toString('base64');
process.env.LOG_LEVEL ??= 'silent';
delete process.env.REDIS_URL;

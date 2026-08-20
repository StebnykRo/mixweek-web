import { z } from 'zod';

/**
 * docs/12-security.md §2.1 — the canonical bootstrap list. Everything else is
 * an encrypted row in SecretSetting, read through getSecret().
 *
 * Fail-fast at start-up, and never echo a value into the error message.
 */
const base64Key = (bytes: number) =>
  z
    .string()
    .refine((v) => {
      try {
        return Buffer.from(v, 'base64').length === bytes;
      } catch {
        return false;
      }
    }, `must be ${bytes} bytes, base64-encoded`);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32),
  APP_MASTER_KEY: base64Key(32),
  APP_MASTER_KEY_PREVIOUS: base64Key(32).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n  - ${missing.join('\n  - ')}`);
  }
  return parsed.data;
}

let cached: Env | null = null;

export function env(): Env {
  if (!cached) cached = load();
  return cached;
}

export const isProduction = () => env().NODE_ENV === 'production';
export const isTest = () => env().NODE_ENV === 'test';

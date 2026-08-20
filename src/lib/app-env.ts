/**
 * The deployment environment, as distinct from the build mode.
 *
 * `next start` forces NODE_ENV=production regardless of how it was invoked, so
 * NODE_ENV alone cannot tell a real deployment apart from a production build
 * being exercised locally or by the end-to-end suite. APP_ENV carries that,
 * and defaults to NODE_ENV when it is not set.
 *
 * Everything that must behave differently outside production keys off this:
 * the file-drop mail transport, the `__Host-` cookie prefix (which needs HTTPS),
 * the rate-limit multiplier and the noindex header.
 */
export type AppEnv = 'development' | 'test' | 'e2e' | 'preview' | 'staging' | 'production';

const VALUES: AppEnv[] = ['development', 'test', 'e2e', 'preview', 'staging', 'production'];

export function appEnv(): AppEnv {
  const raw = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
  return (VALUES as string[]).includes(raw) ? (raw as AppEnv) : 'development';
}

export const isProductionEnv = (): boolean => appEnv() === 'production';

/** True where a real deployment's constraints apply: HTTPS, no debug outputs. */
export const isHardenedEnv = (): boolean => appEnv() === 'production' || appEnv() === 'staging';

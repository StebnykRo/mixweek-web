import { withSystemScope } from '@/lib/db/tenant-client';
import { cached, tenantKey, invalidateTenant } from '@/lib/cache';

/**
 * docs/04-white-label.md §5 — settings resolve Event → Tenant → Platform.
 */
export const SETTING_DEFAULTS = {
  'module.programme': true,
  'module.map': true,
  'module.winstyle': true,
  'module.travel': true,
  'module.media': true,
  'module.eventstyle': true,
  'auth.mfa_policy': 'REQUIRED_STAFF',
  'auth.google': false,
  'auth.captcha': false,
  'brand.public': true,
  'analytics.enabled': true,
  'mail.from_name': 'Mix Week',
  'mail.from_email': 'no-reply@mixweek.app',
  'support.email': '',
  'support.phone': '',
  'legal.terms_url': '/legal/terms',
  'legal.privacy_url': '/legal/privacy',
  'legal.version': '2026-01',
  'tenant.custom_host': false,
  'map.google': false,
  'media.embed': false,
  'media.self_hosted_upload': false,
  'security.av_scan': false,
  'platform.readonly': false,
  'registration.cancel_until_start': true,
  'booking.cancel_hours_before': 2,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue = (typeof SETTING_DEFAULTS)[SettingKey];

export type MfaPolicy = 'REQUIRED_ALL' | 'REQUIRED_STAFF' | 'OPTIONAL';

const TTL_SECONDS = 60;

export async function getSetting<K extends SettingKey>(
  key: K,
  scope: { tenantId?: string | null; eventId?: string | null },
): Promise<SettingValue> {
  const fallback = SETTING_DEFAULTS[key];
  if (!scope.tenantId) return fallback;

  // Settings resolve before any tenant scope exists on the login screen, and
  // the lookup is keyed by (tenantId, key) — docs/02 §4.2.
  const record = await cached(tenantKey(scope.tenantId, 'setting', key), TTL_SECONDS, async () =>
    withSystemScope('read tenant setting', (db) =>
      db.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId: scope.tenantId as string, key } },
        select: { value: true },
      }),
    ),
  );

  if (record && record.value !== null && record.value !== undefined) {
    return record.value as SettingValue;
  }
  return fallback;
}

export async function setSetting(tenantId: string, key: SettingKey, value: unknown): Promise<void> {
  await withSystemScope('write tenant setting', (db) =>
    db.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, value: value as never },
      update: { value: value as never },
    }),
  );
  await invalidateTenant(tenantId, 'setting');
}

export async function getMfaPolicy(tenantId: string | null | undefined): Promise<MfaPolicy> {
  const value = await getSetting('auth.mfa_policy', { tenantId });
  return value as MfaPolicy;
}

/**
 * Feature flags resolve in the opposite direction to settings: the most
 * specific row wins (event → tenant → platform default → literal false).
 */
export async function isFeatureEnabled(
  key: string,
  scope: { tenantId?: string | null; eventId?: string | null },
): Promise<boolean> {
  const rows = await withSystemScope('read feature flag', (db) =>
    db.featureFlag.findMany({
      where: {
        key,
        OR: [
          ...(scope.eventId ? [{ eventId: scope.eventId }] : []),
          ...(scope.tenantId ? [{ tenantId: scope.tenantId, eventId: null }] : []),
          { tenantId: null, eventId: null },
        ],
      },
      select: { enabled: true, eventId: true, tenantId: true },
    }),
  );

  const byEvent = rows.find((r) => r.eventId && r.eventId === scope.eventId);
  if (byEvent) return byEvent.enabled;
  const byTenant = rows.find((r) => !r.eventId && r.tenantId === scope.tenantId);
  if (byTenant) return byTenant.enabled;
  const platform = rows.find((r) => !r.eventId && !r.tenantId);
  if (platform) return platform.enabled;

  const fallback = SETTING_DEFAULTS[key as SettingKey];
  return typeof fallback === 'boolean' ? fallback : false;
}

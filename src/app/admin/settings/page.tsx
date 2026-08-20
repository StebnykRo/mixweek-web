import { requirePermission } from '@/modules/admin/guard';
import { getSetting, SETTING_DEFAULTS, type SettingKey } from '@/modules/tenancy/settings';
import { SettingsPanel } from '@/components/admin/settings-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

const KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

/** docs/04-white-label.md §5 — everything configurable per tenant. */
export default async function AdminSettingsPage() {
  const session = await requirePermission('setting:read');

  const entries = await Promise.all(
    KEYS.map(async (key) => [key, await getSetting(key, { tenantId: session.tenantId })] as const),
  );

  return <SettingsPanel settings={Object.fromEntries(entries)} defaults={SETTING_DEFAULTS} />;
}

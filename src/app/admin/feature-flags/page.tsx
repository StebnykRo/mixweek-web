import { requirePermission } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { FeatureFlagsPanel } from '@/components/admin/feature-flags-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Feature flags' };

const KNOWN_FLAGS = [
  'module.programme',
  'module.map',
  'module.winstyle',
  'module.travel',
  'module.media',
  'module.eventstyle',
  'auth.google',
  'auth.captcha',
  'map.google',
  'media.embed',
  'media.self_hosted_upload',
  'tenant.custom_host',
  'security.av_scan',
  'platform.readonly',
];

export default async function FeatureFlagsPage() {
  const session = await requirePermission('feature_flag:read');

  const rows = await withTenant(session.tenantId, (db) =>
    db.featureFlag.findMany({ select: { key: true, enabled: true, eventId: true } }),
  );
  const byKey = new Map(rows.filter((row) => row.eventId === null).map((row) => [row.key, row.enabled]));

  return (
    <FeatureFlagsPanel
      flags={KNOWN_FLAGS.map((key) => ({ key, enabled: byKey.get(key) ?? defaultFor(key) }))}
    />
  );
}

function defaultFor(key: string): boolean {
  return key.startsWith('module.');
}

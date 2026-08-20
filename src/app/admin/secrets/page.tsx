import { requirePermission } from '@/modules/admin/guard';
import { listSecrets, SECRET_KEYS } from '@/lib/crypto/secrets';
import { SecretsPanel } from '@/components/admin/secrets-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Secrets' };

/**
 * docs/10-admin.md §3.12 — a mask, a rotation date and an author.
 * The stored value is never returned to this page, or to any other.
 */
export default async function AdminSecretsPage() {
  const session = await requirePermission('secret:read');
  const secrets = await listSecrets({ tenantId: session.tenantId });

  return (
    <SecretsPanel
      knownKeys={[...SECRET_KEYS]}
      items={secrets.map((secret) => ({
        key: secret.key,
        hint: secret.hint,
        keyVersion: secret.keyVersion,
        rotatedAt: secret.rotatedAt?.toISOString() ?? null,
        expiresAt: secret.expiresAt?.toISOString() ?? null,
        expiringSoon: secret.expiringSoon,
      }))}
    />
  );
}

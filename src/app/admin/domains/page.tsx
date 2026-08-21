import { requirePermission, allows } from '@/modules/admin/guard';
import { withTenant } from '@/lib/db/tenant-client';
import { listBrands } from '@/modules/admin/brands';
import { DomainsPanel, type DomainRow } from '@/components/admin/domains-panel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Domains' };

/** docs/04-white-label.md §2 — which addresses reach this tenant, and under which brand. */
export default async function AdminDomainsPage() {
  const session = await requirePermission('tenant:read');

  const [domains, brands] = await Promise.all([
    withTenant(session.tenantId, (db) =>
      db.tenantDomain.findMany({
        orderBy: [{ hostType: 'asc' }, { domain: 'asc' }],
        select: { id: true, domain: true, hostType: true, isPrimary: true, autoJoin: true, brandId: true },
      }),
    ),
    listBrands(session.tenantId),
  ]);

  return (
    <DomainsPanel
      domains={domains as DomainRow[]}
      brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))}
      canWrite={allows(session, 'tenant:write')}
    />
  );
}

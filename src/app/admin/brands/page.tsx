import Link from 'next/link';
import { requirePermission } from '@/modules/admin/guard';
import { listBrands } from '@/modules/admin/brands';
import { checkContrast } from '@/modules/branding/contrast';
import { BrandTokensSchema } from '@/modules/branding/schemas';
import { Badge } from '@/components/ui/badge';
import { allows } from '@/modules/admin/guard';
import { NewBrandButton } from '@/components/admin/new-brand-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brands' };

export default async function AdminBrandsPage() {
  const session = await requirePermission('brand:read');
  const brands = await listBrands(session.tenantId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Brands</h1>
        {allows(session, 'brand:write') ? <NewBrandButton /> : null}
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {brands.map((brand) => {
          const parsed = BrandTokensSchema.safeParse(brand.tokens);
          const contrast = parsed.success ? checkContrast(parsed.data) : null;
          const swatches = parsed.success
            ? [parsed.data.colors.primary[500], parsed.data.colors.secondary[500], parsed.data.colors.ink]
            : [];

          return (
            <li key={brand.id} className="rounded-lg bg-surface p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/brands/${brand.id}`} className="font-display text-lg">
                    {brand.name}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {brand.appName} · v{brand.version}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {brand.isDefault ? <Badge tone="primary">Default</Badge> : null}
                  <Badge tone={brand.status === 'PUBLISHED' ? 'success' : 'neutral'}>{brand.status}</Badge>
                </div>
              </div>

              <div className="mt-3 flex gap-1.5">
                {swatches.map((color) => (
                  <span
                    key={color}
                    aria-hidden="true"
                    className="h-8 w-8 rounded-sm border border-divider"
                    style={{ background: color }}
                  />
                ))}
              </div>

              {contrast ? (
                <p className={`mt-3 text-xs font-semibold ${contrast.pass ? 'text-success' : 'text-danger'}`}>
                  {contrast.pass ? 'Passes WCAG AA' : 'Fails contrast — cannot be published'}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

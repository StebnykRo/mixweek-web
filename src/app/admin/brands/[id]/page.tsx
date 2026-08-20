import { requirePermission } from '@/modules/admin/guard';
import { getBrand } from '@/modules/admin/brands';
import { BrandTokensSchema } from '@/modules/branding/schemas';
import { PLATFORM_DEFAULT_TOKENS } from '@/modules/branding/default-brand';
import { BrandEditor } from '@/components/admin/brand-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brand editor' };

/** docs/04-white-label.md §4 — form on the left, live preview on the right. */
export default async function BrandEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('brand:read');
  const { id } = await params;
  const brand = await getBrand(session.tenantId, id);
  const parsed = BrandTokensSchema.safeParse(brand.tokens);

  return (
    <BrandEditor
      brandId={brand.id}
      status={brand.status}
      version={brand.version}
      versions={brand.versions.map((entry) => ({ version: entry.version, createdAt: entry.createdAt.toISOString() }))}
      initial={{
        name: brand.name,
        appName: brand.appName,
        kicker: brand.kicker ?? '',
        logoLightUrl: brand.logoLightUrl ?? '',
        logoMarkUrl: brand.logoMarkUrl ?? '',
        tokens: parsed.success ? parsed.data : PLATFORM_DEFAULT_TOKENS,
      }}
    />
  );
}

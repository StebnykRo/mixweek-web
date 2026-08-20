import { withSystemScope } from '@/lib/db/tenant-client';
import { cached, invalidateTenant, tenantKey } from '@/lib/cache';
import { BrandTokensSchema } from './schemas';
import { NEUTRAL_BRAND, PLATFORM_DEFAULT_TOKENS, type PublicBrand } from './default-brand';

/**
 * docs/04-white-label.md §1 — the theme resolution chain, highest priority first:
 *   1. ?brandPreview (admin, non-production, signed)
 *   2. Event.brandId
 *   3. TenantDomain.brandId
 *   4. Tenant default brand
 *   5. Platform neutral brand
 */

const TTL_SECONDS = 300;

function toPublic(row: {
  id: string;
  key: string;
  appName: string;
  kicker: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  logoMarkUrl: string | null;
  ogImageUrl: string | null;
  tokens: unknown;
  customCss: string | null;
}): PublicBrand {
  const parsed = BrandTokensSchema.safeParse(row.tokens);
  return {
    id: row.id,
    key: row.key,
    appName: row.appName,
    kicker: row.kicker,
    logoLightUrl: row.logoLightUrl,
    logoDarkUrl: row.logoDarkUrl,
    logoMarkUrl: row.logoMarkUrl,
    ogImageUrl: row.ogImageUrl,
    tokens: parsed.success ? parsed.data : PLATFORM_DEFAULT_TOKENS,
    customCss: row.customCss,
  };
}

const SELECT = {
  id: true,
  key: true,
  appName: true,
  kicker: true,
  logoLightUrl: true,
  logoDarkUrl: true,
  logoMarkUrl: true,
  ogImageUrl: true,
  tokens: true,
  customCss: true,
} as const;

export async function getBrandById(brandId: string, opts?: { allowDraft?: boolean }): Promise<PublicBrand | null> {
  const key = `brand:${brandId}:${opts?.allowDraft ? 'draft' : 'published'}`;
  // The brand is resolved on the login screen, before a tenant scope exists
  // (docs/04 §2.1). The read is keyed by brand id and only ever returns the
  // public presentation fields.
  const row = await cached(key, TTL_SECONDS, () =>
    withSystemScope('resolve brand by id', (db) =>
      db.brand.findFirst({
        where: { id: brandId, ...(opts?.allowDraft ? {} : { status: 'PUBLISHED' }) },
        select: SELECT,
      }),
    ),
  );
  return row ? toPublic(row) : null;
}

export async function getTenantDefaultBrand(tenantId: string): Promise<PublicBrand | null> {
  const row = await cached(tenantKey(tenantId, 'brand', 'default'), TTL_SECONDS, () =>
    withSystemScope('resolve default brand', (db) =>
      db.brand.findFirst({
        where: { tenantId, isDefault: true, status: 'PUBLISHED' },
        select: SELECT,
      }),
    ),
  );
  return row ? toPublic(row) : null;
}

export type BrandResolution = {
  tenantId: string | null;
  eventBrandId?: string | null;
  domainBrandId?: string | null;
  previewBrandId?: string | null;
};

export async function resolveBrand(input: BrandResolution): Promise<PublicBrand> {
  if (input.previewBrandId) {
    const preview = await getBrandById(input.previewBrandId, { allowDraft: true });
    if (preview) return preview;
  }
  if (input.eventBrandId) {
    const brand = await getBrandById(input.eventBrandId);
    if (brand) return brand;
  }
  if (input.domainBrandId) {
    const brand = await getBrandById(input.domainBrandId);
    if (brand) return brand;
  }
  if (input.tenantId) {
    const brand = await getTenantDefaultBrand(input.tenantId);
    if (brand) return brand;
  }
  return NEUTRAL_BRAND;
}

export async function invalidateBrand(tenantId: string, brandId: string): Promise<void> {
  await invalidateTenant(tenantId, 'brand');
  const { kvDel } = await import('@/lib/redis');
  await kvDel(`brand:${brandId}:published`, `brand:${brandId}:draft`);
}

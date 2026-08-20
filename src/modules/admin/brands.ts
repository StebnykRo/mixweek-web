import type { Prisma } from '@prisma/client';
import { withSystemScope, withTenant } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { BrandTokensSchema, type BrandTokens } from '@/modules/branding/schemas';
import { checkContrast } from '@/modules/branding/contrast';
import { invalidateBrand } from '@/modules/branding/service';
import type { AdminActor } from './events';

/** docs/04-white-label.md §4 — the brand editor: draft, preview, publish, roll back. */

export async function listBrands(tenantId: string) {
  return withTenant(tenantId, (db) =>
    db.brand.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        appName: true,
        kicker: true,
        isDefault: true,
        status: true,
        version: true,
        publishedAt: true,
        updatedAt: true,
        logoLightUrl: true,
        logoMarkUrl: true,
        tokens: true,
      },
    }),
  );
}

export async function getBrand(tenantId: string, brandId: string) {
  const brand = await withTenant(tenantId, (db) =>
    db.brand.findFirst({
      where: { id: brandId },
      select: {
        id: true,
        key: true,
        name: true,
        appName: true,
        kicker: true,
        isDefault: true,
        status: true,
        version: true,
        tokens: true,
        customCss: true,
        logoLightUrl: true,
        logoDarkUrl: true,
        logoMarkUrl: true,
        ogImageUrl: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 20,
          select: { id: true, version: true, createdAt: true, createdBy: true },
        },
      },
    }),
  );
  if (!brand) throw notFound({ brandId });
  return brand;
}

export type BrandDraft = {
  name: string;
  appName: string;
  kicker?: string | null;
  logoLightUrl?: string | null;
  logoDarkUrl?: string | null;
  logoMarkUrl?: string | null;
  ogImageUrl?: string | null;
  tokens: BrandTokens;
};

export async function saveDraft(tenantId: string, brandId: string, draft: BrandDraft, actor: AdminActor) {
  const tokens = BrandTokensSchema.parse(draft.tokens);

  await withTenant(tenantId, (db) =>
    db.brand.update({
      where: { id: brandId },
      data: {
        name: draft.name,
        appName: draft.appName,
        kicker: draft.kicker ?? null,
        logoLightUrl: draft.logoLightUrl ?? null,
        logoDarkUrl: draft.logoDarkUrl ?? null,
        logoMarkUrl: draft.logoMarkUrl ?? null,
        ogImageUrl: draft.ogImageUrl ?? null,
        tokens: tokens as unknown as Prisma.InputJsonValue,
        status: 'DRAFT',
      },
    }),
  );

  await invalidateBrand(tenantId, brandId);
  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'brand.draft_save',
    entityType: 'Brand',
    entityId: brandId,
  });

  return checkContrast(tokens);
}

/**
 * docs/04 §4.3 — publication is blocked when the palette fails WCAG AA. This is
 * the one place where a design decision is refused outright: an unreadable
 * brand is not a preference, it is a defect that reaches every participant.
 */
export async function publishBrand(tenantId: string, brandId: string, actor: AdminActor) {
  const brand = await withTenant(tenantId, (db) =>
    db.brand.findFirst({ where: { id: brandId }, select: { id: true, tokens: true, version: true } }),
  );
  if (!brand) throw notFound({ brandId });

  const tokens = BrandTokensSchema.parse(brand.tokens);
  const contrast = checkContrast(tokens);
  if (!contrast.pass) {
    throw new AppError('CONFLICT', 'This palette does not meet WCAG AA contrast and cannot be published', {
      details: contrast.results.filter((result) => !result.pass),
    });
  }

  const nextVersion = brand.version + 1;

  await withTenant(tenantId, async (db, scopedTenantId) => {
    const snapshot = await db.brand.findFirst({ where: { id: brandId } });
    await db.brandVersion.create({
      data: {
        tenantId: scopedTenantId,
        brandId,
        version: nextVersion,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        createdBy: actor.userId,
      },
    });
    await db.brand.update({
      where: { id: brandId },
      data: { status: 'PUBLISHED', version: nextVersion, publishedAt: new Date() },
    });
  });

  await invalidateBrand(tenantId, brandId);
  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'brand.publish',
    entityType: 'Brand',
    entityId: brandId,
    diff: { version: nextVersion },
  });

  return { version: nextVersion, contrast };
}

/** docs/04 §4.8 — roll back to any earlier version in one click. */
export async function rollbackBrand(tenantId: string, brandId: string, version: number, actor: AdminActor) {
  await withTenant(tenantId, async (db) => {
    const target = await db.brandVersion.findFirst({
      where: { brandId, version },
      select: { snapshot: true },
    });
    if (!target) throw notFound({ brandId, version });

    const snapshot = target.snapshot as Record<string, unknown>;
    await db.brand.update({
      where: { id: brandId },
      data: {
        appName: String(snapshot.appName ?? ''),
        kicker: (snapshot.kicker as string | null) ?? null,
        logoLightUrl: (snapshot.logoLightUrl as string | null) ?? null,
        logoDarkUrl: (snapshot.logoDarkUrl as string | null) ?? null,
        logoMarkUrl: (snapshot.logoMarkUrl as string | null) ?? null,
        ogImageUrl: (snapshot.ogImageUrl as string | null) ?? null,
        tokens: snapshot.tokens as Prisma.InputJsonValue,
        customCss: (snapshot.customCss as string | null) ?? null,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  });

  await invalidateBrand(tenantId, brandId);
  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'brand.rollback',
    entityType: 'Brand',
    entityId: brandId,
    diff: { version },
  });
}

/** docs/04 §4.2 — one base colour generates the 50…900 ramp in OKLCH. */
export async function generateRamp(baseHex: string): Promise<Record<string, string>> {
  const { converter, formatHex, clampChroma } = await import('culori');
  const toOklch = converter('oklch');
  const base = toOklch(baseHex);
  if (!base) throw new AppError('VALIDATION_FAILED', 'Not a colour we can read');

  // A shared lightness scale means the same step of any role reads as the same
  // visual weight, which is what keeps a generated palette coherent.
  const lightness: Record<string, number> = {
    50: 0.98,
    100: 0.95,
    200: 0.9,
    300: 0.82,
    400: 0.71,
    500: 0.58,
    600: 0.52,
    700: 0.44,
    800: 0.34,
    900: 0.24,
  };

  const ramp: Record<string, string> = {};
  for (const [step, l] of Object.entries(lightness)) {
    const chromaScale = l > 0.9 ? 0.25 : l > 0.8 ? 0.55 : 1;
    ramp[step] = formatHex(
      clampChroma({ mode: 'oklch', l, c: (base.c ?? 0) * chromaScale, h: base.h ?? 0 }, 'oklch'),
    );
  }
  return ramp;
}

export { checkContrast };
export type { AdminActor };

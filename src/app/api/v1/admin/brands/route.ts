import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import { listBrands } from '@/modules/admin/brands';
import { PLATFORM_DEFAULT_TOKENS } from '@/modules/branding/default-brand';

export const dynamic = 'force-dynamic';

const CreateBrandSchema = z.strictObject({
  // The key appears in URLs and in the domain mapping, so it is constrained
  // the same way an event slug is.
  key: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}$/, 'lowercase letters, digits and hyphens'),
  name: z.string().trim().min(1).max(80),
  appName: z.string().trim().min(1).max(80),
});

export const GET = route(
  { auth: { mode: 'permission', action: 'brand:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => ({ items: await listBrands(session.tenantId as string) }),
);

/**
 * POST /api/v1/admin/brands — a second brand for the same tenant.
 *
 * There was no way to create one at all: a tenant was stuck with whatever
 * brand provisioning gave it, which defeats the point of white-label when a
 * company runs more than one event identity.
 *
 * It starts from the platform palette as a DRAFT. Nothing is visible to
 * anyone until it is published, and the colours are edited on the brand's own
 * page afterwards.
 */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'brand:write' },
    limit: 'admin.mutation',
    body: CreateBrandSchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    const tenantId = session.tenantId as string;

    const brand = await withTenant(tenantId, async (db, scopedTenantId) => {
      const clash = await db.brand.findFirst({ where: { key: body.key }, select: { id: true } });
      if (clash) throw new AppError('VALIDATION_FAILED', `A brand with the key "${body.key}" already exists`);

      return db.brand.create({
        data: {
          tenantId: scopedTenantId,
          key: body.key,
          name: body.name,
          appName: body.appName,
          isDefault: false,
          tokens: PLATFORM_DEFAULT_TOKENS as never,
          status: 'DRAFT',
        },
        select: { id: true, key: true, name: true },
      });
    });

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'brand.create',
      entityType: 'Brand',
      entityId: brand.id,
      diff: { key: brand.key, name: brand.name },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return brand;
  },
);

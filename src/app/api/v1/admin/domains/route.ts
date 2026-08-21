import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const DomainSchema = z.strictObject({
  /**
   * An email domain (`acme.com`) or a hostname the app answers on
   * (`events.acme.com`) — same syntax, different meaning, hence hostType.
   */
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/, 'not a valid domain'),
  hostType: z.enum(['EMAIL', 'HOST']).default('EMAIL'),
  brandId: z.string().min(1).nullable().optional(),
  /** Whether anyone with an address here joins automatically on first sign-in. */
  autoJoin: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
});

/** GET /api/v1/admin/domains */
export const GET = route(
  { auth: { mode: 'permission', action: 'tenant:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => {
    const items = await withTenant(session.tenantId as string, (db) =>
      db.tenantDomain.findMany({
        orderBy: [{ hostType: 'asc' }, { domain: 'asc' }],
        select: {
          id: true,
          domain: true,
          hostType: true,
          isPrimary: true,
          autoJoin: true,
          verifiedAt: true,
          brandId: true,
        },
      }),
    );
    return { items };
  },
);

/**
 * POST /api/v1/admin/domains
 *
 * Adding a domain was only possible by running ops:provision-tenant on the
 * server, so onboarding a second company email domain needed shell access.
 *
 * An EMAIL domain decides which tenant a person belongs to when they sign in,
 * so this is a security-relevant control: anyone with an address there can
 * reach this tenant's events. Every change is audited.
 */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'tenant:write' },
    limit: 'admin.mutation',
    body: DomainSchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    const tenantId = session.tenantId as string;

    const created = await withTenant(tenantId, async (db, scopedTenantId) => {
      // The domain is unique across every tenant, so a clash may belong to
      // someone else. The message says no more than that it is taken.
      const clash = await db.tenantDomain.findFirst({ where: { domain: body.domain }, select: { id: true } });
      if (clash) throw new AppError('VALIDATION_FAILED', `${body.domain} is already registered`);

      if (body.brandId) {
        const brand = await db.brand.findFirst({ where: { id: body.brandId }, select: { id: true } });
        if (!brand) throw new AppError('VALIDATION_FAILED', 'That brand does not exist');
      }

      if (body.isPrimary) {
        await db.tenantDomain.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } });
      }

      return db.tenantDomain.create({
        data: {
          tenantId: scopedTenantId,
          domain: body.domain,
          hostType: body.hostType,
          brandId: body.brandId ?? null,
          autoJoin: body.autoJoin,
          isPrimary: body.isPrimary,
          // Ownership is asserted by an administrator here rather than proven
          // by DNS; docs/04 §2.3 leaves DNS verification to a later step.
          verifiedAt: new Date(),
        },
        select: { id: true, domain: true, hostType: true },
      });
    });

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'tenant.domain_add',
      entityType: 'TenantDomain',
      entityId: created.id,
      diff: { domain: created.domain, hostType: created.hostType, autoJoin: body.autoJoin },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return created;
  },
);

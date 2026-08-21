import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { notFound } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/v1/admin/domains/[id]
 *
 * Removing an EMAIL domain stops new people from that address signing in.
 * It does not remove anyone who already has a membership — those are separate
 * records, and revoking access is People's job, not this screen's.
 */
export const DELETE = route(
  {
    auth: { mode: 'permission', action: 'tenant:delete' },
    limit: 'admin.mutation',
    personal: true,
    mutates: true,
  },
  async ({ params, session, ctx }) => {
    const tenantId = session.tenantId as string;
    const id = params.id as string;

    const removed = await withTenant(tenantId, async (db) => {
      const existing = await db.tenantDomain.findFirst({
        where: { id },
        select: { id: true, domain: true, hostType: true },
      });
      if (!existing) throw notFound({ domainId: id });
      await db.tenantDomain.delete({ where: { id } });
      return existing;
    });

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'tenant.domain_remove',
      entityType: 'TenantDomain',
      entityId: removed.id,
      diff: { domain: removed.domain, hostType: removed.hostType },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return { ok: true };
  },
);

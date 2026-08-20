import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { globalDb } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant-client';
import { enqueue } from '@/lib/queue';
import { DELETION_GRACE_DAYS } from '@/modules/admin/constants';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({ kind: z.enum(['EXPORT', 'DELETE']) });


/**
 * POST /api/v1/me/data-requests
 *
 * docs/12-security.md §10 — access and erasure. Deletion is scheduled, not
 * immediate: 30 days of grace during which the person can change their mind.
 */
export const GET = route({ auth: { mode: 'session' }, limit: 'api.authenticated', personal: true }, async ({ session }) => {
  const requests = await withTenant(session.tenantId as string, (db) =>
    db.dataRequest.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, kind: true, status: true, createdAt: true, processedAt: true },
    }),
  );

  const user = await globalDb.user.findUnique({
    where: { id: session.userId },
    select: { deletionRequestedAt: true },
  });

  return {
    items: requests,
    deletionRequestedAt: user?.deletionRequestedAt ?? null,
    deletionEffectiveAt: user?.deletionRequestedAt
      ? new Date(user.deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)
      : null,
  };
});

export const POST = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', body: BodySchema, personal: true, mutates: true },
  async ({ body, session, ctx }) => {
    const tenantId = session.tenantId as string;

    const pending = await withTenant(tenantId, (db) =>
      db.dataRequest.findFirst({
        where: { userId: session.userId, kind: body.kind, status: { in: ['PENDING', 'PROCESSING'] } },
        select: { id: true },
      }),
    );
    if (pending) throw new AppError('CONFLICT', 'A request of this kind is already being processed');

    const created = await withTenant(tenantId, (db, scopedTenantId) =>
      db.dataRequest.create({
        data: { tenantId: scopedTenantId, userId: session.userId, kind: body.kind, status: 'PENDING' },
        select: { id: true, kind: true, status: true, createdAt: true },
      }),
    );

    if (body.kind === 'DELETE') {
      await globalDb.user.update({ where: { id: session.userId }, data: { deletionRequestedAt: new Date() } });
    }

    await enqueue('exports', { tenantId, eventId: created.id, requestedBy: session.userId, format: 'csv' }, {
      jobId: `data-request:${created.id}`,
    });

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      action: body.kind === 'EXPORT' ? 'gdpr.export_requested' : 'gdpr.deletion_requested',
      entityType: 'DataRequest',
      entityId: created.id,
      ip: ctx.ip,
    });

    return created;
  },
);

/** DELETE — cancels a pending erasure while the grace period is still running. */
export const DELETE = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true, mutates: true },
  async ({ session, ctx }) => {
    const tenantId = session.tenantId as string;
    await globalDb.user.update({ where: { id: session.userId }, data: { deletionRequestedAt: null } });
    await withTenant(tenantId, (db) =>
      db.dataRequest.updateMany({
        where: { userId: session.userId, kind: 'DELETE', status: 'PENDING' },
        data: { status: 'FAILED', processedAt: new Date() },
      }),
    );
    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      action: 'gdpr.deletion_cancelled',
      ip: ctx.ip,
    });
    return { ok: true };
  },
);

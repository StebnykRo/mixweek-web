import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export const GET = route(
  { auth: { mode: 'permission', action: 'feature_flag:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => ({
    items: await withTenant(session.tenantId as string, (db) =>
      db.featureFlag.findMany({ orderBy: { key: 'asc' }, select: { id: true, key: true, enabled: true, eventId: true, tenantId: true } }),
    ),
  }),
);

const BodySchema = z.strictObject({
  key: z.string().min(3).max(80).regex(/^[a-z0-9_.]+$/),
  enabled: z.boolean(),
  eventId: z.string().min(10).max(40).nullable().optional(),
});

export const PATCH = route(
  {
    auth: { mode: 'permission', action: 'feature_flag:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    const tenantId = session.tenantId as string;

    // The compound unique includes a nullable eventId, which Prisma's upsert
    // input cannot express, so the existing row is looked up first.
    await withTenant(tenantId, async (db, scopedTenantId) => {
      const existing = await db.featureFlag.findFirst({
        where: { eventId: body.eventId ?? null, key: body.key, tenantId: scopedTenantId },
        select: { id: true },
      });
      if (existing) {
        await db.featureFlag.update({ where: { id: existing.id }, data: { enabled: body.enabled } });
        return;
      }
      await db.featureFlag.create({
        data: { tenantId: scopedTenantId, eventId: body.eventId ?? null, key: body.key, enabled: body.enabled },
      });
    });

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'feature_flag.update',
      entityId: body.key,
      diff: { enabled: body.enabled, eventId: body.eventId ?? null },
      ip: ctx.ip,
    });

    return { ok: true };
  },
);

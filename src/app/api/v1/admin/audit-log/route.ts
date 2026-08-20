import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  action: z.string().max(80).optional(),
  entityType: z.string().max(40).optional(),
  actorId: z.string().max(40).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** docs/10-admin.md §3.13 — the audit log is read-only, even for the database role. */
export const GET = route(
  { auth: { mode: 'permission', action: 'audit:read' }, limit: 'admin.mutation', query: QuerySchema, personal: true },
  async ({ query, session }) => {
    const rows = await withTenant(session.tenantId as string, (db) =>
      db.auditLog.findMany({
        where: {
          ...(query.action ? { action: { startsWith: query.action } } : {}),
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.actorId ? { actorId: query.actorId } : {}),
          ...(query.from || query.to
            ? { createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorRole: true,
          diff: true,
          requestId: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
    );

    const page = rows.slice(0, query.limit);
    return { items: page, nextCursor: rows.length > query.limit ? (page[page.length - 1]?.id ?? null) : null };
  },
);

import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { notFound } from '@/lib/errors';
import { withTenant } from '@/lib/db/tenant-client';
import { CuidSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({ checked: z.boolean() });

/** PUT /api/v1/checklist/{itemId} — state syncs across a person's devices. */
export const PUT = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', body: BodySchema, personal: true, mutates: true },
  async ({ params, body, session }) => {
    const itemId = CuidSchema.parse(params.itemId);
    const tenantId = session.tenantId as string;

    await withTenant(tenantId, async (db, scopedTenantId) => {
      const item = await db.checklistItem.findFirst({ where: { id: itemId, deletedAt: null }, select: { id: true } });
      if (!item) throw notFound({ itemId });

      await db.checklistState.upsert({
        where: { userId_itemId: { userId: session.userId, itemId: item.id } },
        create: { tenantId: scopedTenantId, userId: session.userId, itemId: item.id, checked: body.checked },
        update: { checked: body.checked },
      });
    });

    return { ok: true, checked: body.checked };
  },
);

import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { rollbackBrand } from '@/modules/admin/brands';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({ version: z.number().int().min(1).max(100000) });

export const POST = route(
  {
    auth: { mode: 'permission', action: 'brand:publish' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) => {
    await rollbackBrand(session.tenantId as string, CuidSchema.parse(params.id), body.version, {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    });
    return { ok: true };
  },
);

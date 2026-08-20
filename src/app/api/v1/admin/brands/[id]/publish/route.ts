import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { publishBrand } from '@/modules/admin/brands';

export const dynamic = 'force-dynamic';

/** docs/04 §4.7 — publishing needs step-up, enforced by `brand:publish`. */
export const POST = route(
  { auth: { mode: 'permission', action: 'brand:publish' }, limit: 'admin.mutation', personal: true, mutates: true },
  async ({ params, session }) =>
    publishBrand(session.tenantId as string, CuidSchema.parse(params.id), {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    }),
);

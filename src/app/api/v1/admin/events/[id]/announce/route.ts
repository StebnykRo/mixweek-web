import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { announcePendingActivities } from '@/modules/admin/programme';

export const dynamic = 'force-dynamic';

/** docs/11 §5 — send the batched "new sessions" message now instead of waiting. */
export const POST = route(
  { auth: { mode: 'permission', action: 'programme:publish' }, limit: 'admin.mutation', personal: true, mutates: true },
  async ({ params, session }) =>
    announcePendingActivities(session.tenantId as string, CuidSchema.parse(params.id), {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    }),
);

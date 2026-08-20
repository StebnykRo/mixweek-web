import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { publicationChecklist, publishEvent } from '@/modules/admin/events';

export const dynamic = 'force-dynamic';

/** GET — the readiness checklist, so the UI can show what is still missing. */
export const GET = route(
  { auth: { mode: 'permission', action: 'event:read' }, limit: 'admin.mutation', personal: true },
  async ({ params, session }) => publicationChecklist(session.tenantId as string, CuidSchema.parse(params.id)),
);

/**
 * POST — publish. `event:publish` is a step-up action (docs/03 §5), which the
 * permission check enforces; the checklist is enforced by the service.
 */
export const POST = route(
  { auth: { mode: 'permission', action: 'event:publish' }, limit: 'admin.mutation', personal: true, mutates: true },
  async ({ params, session }) =>
    publishEvent(session.tenantId as string, CuidSchema.parse(params.id), {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    }),
);

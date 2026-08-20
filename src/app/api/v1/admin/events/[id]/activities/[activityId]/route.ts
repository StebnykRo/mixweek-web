import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { ActivityInputSchema, CuidSchema } from '@/modules/events/schemas';
import { cancelActivity, updateActivity } from '@/modules/admin/programme';

export const dynamic = 'force-dynamic';

const PatchSchema = ActivityInputSchema.innerType().partial().extend({
  /** docs/06 §7 — the admin decides whether the change is worth a notification. */
  notify: z.boolean().default(true),
});

export const PATCH = route(
  {
    auth: { mode: 'permission', action: 'programme:write' },
    limit: 'admin.mutation',
    body: PatchSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) => {
    const { notify, ...data } = body;
    return updateActivity(
      session.tenantId as string,
      CuidSchema.parse(params.activityId),
      data,
      { userId: session.userId, email: session.user.email, role: session.role },
      { notify },
    );
  },
);

const DeleteSchema = z.strictObject({ notify: z.boolean().default(true) });

export const DELETE = route(
  {
    auth: { mode: 'permission', action: 'programme:delete' },
    limit: 'admin.mutation',
    body: DeleteSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) => {
    await cancelActivity(
      session.tenantId as string,
      CuidSchema.parse(params.activityId),
      { userId: session.userId, email: session.user.email, role: session.role },
      body.notify,
    );
    return { ok: true };
  },
);

import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { checkIn } from '@/modules/checkin/service';

export const dynamic = 'force-dynamic';

const BodySchema = z
  .strictObject({
    token: z.string().max(500).optional(),
    offlineCode: z.string().trim().min(4).max(12).optional(),
  })
  .refine((value) => Boolean(value.token) !== Boolean(value.offlineCode), {
    message: 'Provide either a scanned token or an offline code',
  });

/** POST /api/v1/admin/events/{id}/check-in — the scanner endpoint (docs/06 §4.6). */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'registration:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) =>
    checkIn({
      tenantId: session.tenantId as string,
      eventId: CuidSchema.parse(params.id),
      actor: { userId: session.userId, email: session.user.email, role: session.role },
      token: body.token,
      offlineCode: body.offlineCode,
    }),
);

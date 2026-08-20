import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { auditLog } from '@/lib/audit';
import { SlugSchema } from '@/modules/events/schemas';
import { duplicateEvent } from '@/modules/admin/duplicate';

export const dynamic = 'force-dynamic';

const DuplicateSchema = z.strictObject({
  slug: SlugSchema,
  title: z.string().trim().min(1).max(120),
  startsAt: z.coerce.date(),
});

/**
 * POST /api/v1/admin/events/[id]/duplicate
 *
 * Builds a new DRAFT from an existing event — the usual way to set up next
 * year from last year. Content only: registrations, orders and announcements
 * stay with the event they belong to (see duplicateEvent).
 */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'event:write' },
    limit: 'admin.mutation',
    body: DuplicateSchema,
    personal: true,
    mutates: true,
  },
  async ({ body, params, session, ctx }) => {
    const tenantId = session.tenantId as string;
    const sourceEventId = params.id as string;

    const result = await duplicateEvent({
      tenantId,
      sourceEventId,
      slug: body.slug,
      title: body.title,
      startsAt: body.startsAt,
    });

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'event.duplicate',
      entityType: 'Event',
      entityId: result.id,
      diff: { from: sourceEventId, slug: result.slug, copied: result.copied },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return result;
  },
);

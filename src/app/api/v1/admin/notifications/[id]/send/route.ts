import { route } from '@/lib/http/handler';
import { AppError, notFound } from '@/lib/errors';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { enqueue } from '@/lib/queue';
import { can } from '@/modules/auth/policies';
import { resolveAudience } from '@/modules/notifications/service';
import { CuidSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

const STEP_UP_THRESHOLD = 100;

/**
 * POST /api/v1/admin/notifications/{id}/send
 *
 * docs/11-notifications.md §9 — a send to more than 100 people needs a fresh
 * second factor. The threshold is checked here, after the audience is resolved,
 * because the count is what decides it.
 */
export const POST = route(
  { auth: { mode: 'permission', action: 'notification:write' }, limit: 'admin.mutation', personal: true, mutates: true },
  async ({ params, session, ctx }) => {
    const tenantId = session.tenantId as string;
    const id = CuidSchema.parse(params.id);

    const notification = await withTenant(tenantId, (db) =>
      db.notification.findFirst({
        where: { id },
        select: {
          id: true,
          kind: true,
          title: true,
          audience: true,
          status: true,
          eventId: true,
          event: { select: { timezone: true } },
        },
      }),
    );
    if (!notification) throw notFound({ id });
    // Append-only: a message that has gone out cannot be re-sent or edited.
    if (notification.status === 'SENT' || notification.status === 'SENDING') {
      throw new AppError('CONFLICT', 'This notification has already been sent');
    }

    const recipients = await resolveAudience(tenantId, notification.eventId, notification.audience as never);
    if (recipients.length > STEP_UP_THRESHOLD && !can(session, 'notification:publish', { tenantId })) {
      throw new AppError('STEP_UP_REQUIRED', 'Confirm your second factor to send to more than 100 people');
    }

    await withTenant(tenantId, (db) =>
      db.notification.update({ where: { id }, data: { status: 'SENDING' } }),
    );

    await enqueue(
      'notifications',
      { tenantId, notificationId: id, timezone: notification.event?.timezone ?? 'UTC' },
      { jobId: `notification:${id}` },
    );

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'notification.send',
      entityType: 'Notification',
      entityId: id,
      diff: { recipients: recipients.length, title: notification.title, kind: notification.kind },
      ip: ctx.ip,
    });

    return { ok: true, recipients: recipients.length };
  },
);

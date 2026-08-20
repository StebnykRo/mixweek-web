import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { invalidateTenant } from '@/lib/cache';
import { CuidSchema, EventInputSchema } from '@/modules/events/schemas';
import { getAdminEvent } from '@/modules/admin/events';

export const dynamic = 'force-dynamic';

export const GET = route(
  { auth: { mode: 'permission', action: 'event:read' }, limit: 'admin.mutation', personal: true },
  async ({ params, session }) => getAdminEvent(session.tenantId as string, CuidSchema.parse(params.id)),
);

const PatchSchema = EventInputSchema.innerType().partial();

export const PATCH = route(
  {
    auth: { mode: 'permission', action: 'event:write' },
    limit: 'admin.mutation',
    body: PatchSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session, ctx }) => {
    const tenantId = session.tenantId as string;
    const id = CuidSchema.parse(params.id);

    const updated = await withTenant(tenantId, (db) =>
      db.event.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.subtitle !== undefined ? { subtitle: body.subtitle } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.coverUrl !== undefined ? { coverUrl: body.coverUrl } : {}),
          ...(body.brandId !== undefined ? { brandId: body.brandId } : {}),
          ...(body.startsAt !== undefined ? { startsAt: body.startsAt } : {}),
          ...(body.endsAt !== undefined ? { endsAt: body.endsAt } : {}),
          ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
          ...(body.city !== undefined ? { city: body.city } : {}),
          ...(body.country !== undefined ? { country: body.country } : {}),
          ...(body.venueName !== undefined ? { venueName: body.venueName } : {}),
          ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
          ...(body.audienceRules !== undefined ? { audienceRules: body.audienceRules as never } : {}),
          ...(body.registrationEnabled !== undefined ? { registrationEnabled: body.registrationEnabled } : {}),
          ...(body.registrationOpensAt !== undefined ? { registrationOpensAt: body.registrationOpensAt } : {}),
          ...(body.registrationClosesAt !== undefined ? { registrationClosesAt: body.registrationClosesAt } : {}),
          ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
          ...(body.waitlistEnabled !== undefined ? { waitlistEnabled: body.waitlistEnabled } : {}),
          ...(body.approvalRequired !== undefined ? { approvalRequired: body.approvalRequired } : {}),
          ...(body.registrationForm !== undefined ? { registrationForm: body.registrationForm as never } : {}),
        },
        select: { id: true, slug: true },
      }),
    );

    await invalidateTenant(tenantId, 'programme');
    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'event.update',
      entityType: 'Event',
      entityId: id,
      diff: { fields: Object.keys(body) },
      ip: ctx.ip,
    });

    return updated;
  },
);

/** Soft delete — the trash keeps it recoverable for 30 days (docs/10 §4). */
export const DELETE = route(
  { auth: { mode: 'permission', action: 'event:delete' }, limit: 'admin.mutation', personal: true, mutates: true },
  async ({ params, session, ctx }) => {
    const tenantId = session.tenantId as string;
    const id = CuidSchema.parse(params.id);

    await withTenant(tenantId, (db) => db.event.update({ where: { id }, data: { deletedAt: new Date() } }));
    await invalidateTenant(tenantId, 'programme');
    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'event.delete',
      entityType: 'Event',
      entityId: id,
      ip: ctx.ip,
    });

    return { ok: true };
  },
);

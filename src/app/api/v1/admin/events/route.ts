import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { EventInputSchema } from '@/modules/events/schemas';
import { listAdminEvents } from '@/modules/admin/events';

export const dynamic = 'force-dynamic';

/** GET /api/v1/admin/events */
export const GET = route(
  { auth: { mode: 'permission', action: 'event:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => ({ items: await listAdminEvents(session.tenantId as string) }),
);

/** POST /api/v1/admin/events — always created as a DRAFT. */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'event:write' },
    limit: 'admin.mutation',
    body: EventInputSchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    const tenantId = session.tenantId as string;

    const event = await withTenant(tenantId, (db, scopedTenantId) =>
      db.event.create({
        data: {
          tenantId: scopedTenantId,
          slug: body.slug,
          title: body.title,
          subtitle: body.subtitle ?? null,
          description: body.description ?? null,
          coverUrl: body.coverUrl ?? null,
          brandId: body.brandId ?? null,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          timezone: body.timezone,
          city: body.city ?? null,
          country: body.country ?? null,
          venueName: body.venueName ?? null,
          visibility: body.visibility,
          audienceRules: (body.audienceRules ?? undefined) as never,
          registrationEnabled: body.registrationEnabled,
          registrationOpensAt: body.registrationOpensAt ?? null,
          registrationClosesAt: body.registrationClosesAt ?? null,
          capacity: body.capacity ?? null,
          waitlistEnabled: body.waitlistEnabled,
          approvalRequired: body.approvalRequired,
          registrationForm: (body.registrationForm ?? undefined) as never,
          status: 'DRAFT',
        },
        select: { id: true, slug: true },
      }),
    );

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'event.create',
      entityType: 'Event',
      entityId: event.id,
      diff: { slug: body.slug, title: body.title },
      ip: ctx.ip,
      requestId: ctx.requestId,
    });

    return event;
  },
);

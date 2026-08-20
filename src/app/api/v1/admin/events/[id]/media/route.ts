import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { CuidSchema } from '@/modules/events/schemas';
import { MediaInputSchema } from '@/modules/media/schemas';
import { createMediaLink } from '@/modules/media/service';
import { stepUpSatisfied } from '@/modules/auth/policies';

export const dynamic = 'force-dynamic';

export const GET = route(
  { auth: { mode: 'permission', action: 'media:read' }, limit: 'admin.mutation', personal: true },
  async ({ params, session }) => ({
    items: await withTenant(session.tenantId as string, (db) =>
      db.mediaLink.findMany({
        where: { eventId: CuidSchema.parse(params.id), deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          kind: true,
          title: true,
          url: true,
          coverUrl: true,
          status: true,
          authorName: true,
          acceptsUploads: true,
          sortOrder: true,
        },
      }),
    ),
  }),
);

/**
 * docs/08-media.md §4.2 — a host outside the allowlist is accepted only from a
 * tenant admin with a fresh second factor, and the decision is audited. The
 * session's step-up state is passed through so the service can enforce it.
 */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'media:write' },
    limit: 'admin.mutation',
    body: MediaInputSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) =>
    createMediaLink({
      tenantId: session.tenantId as string,
      eventId: CuidSchema.parse(params.id),
      actor: {
        userId: session.userId,
        email: session.user.email,
        role: session.role,
        stepUpValid: stepUpSatisfied(session),
      },
      data: body,
    }),
);

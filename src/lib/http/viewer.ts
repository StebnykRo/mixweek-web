import { notFound } from '../errors';
import { withTenant } from '../db/tenant-client';
import type { SessionContext } from '@/modules/auth/session';
import type { Viewer } from '@/modules/events/service';

/** The session, reduced to what the domain services need. */
export function viewerOf(session: SessionContext): Viewer {
  if (!session.tenantId) throw notFound();
  return {
    userId: session.userId,
    tenantId: session.tenantId,
    role: session.role,
    department: session.user.department,
    team: session.user.team,
  };
}

export type ResolvedEvent = {
  id: string;
  slug: string;
  title: string;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  brandId: string | null;
};

/** Resolves a slug within the session's tenant. Anything else is a 404. */
export async function requireEvent(tenantId: string, slug: string): Promise<ResolvedEvent> {
  const event = await withTenant(tenantId, (db) =>
    db.event.findFirst({
      where: { slug, deletedAt: null, status: { in: ['PUBLISHED', 'ARCHIVED', 'CANCELLED'] } },
      select: {
        id: true,
        slug: true,
        title: true,
        timezone: true,
        startsAt: true,
        endsAt: true,
        status: true,
        brandId: true,
      },
    }),
  );
  if (!event) throw notFound({ slug });
  return event;
}

/** Admin variant: drafts are visible too. */
export async function requireEventForAdmin(tenantId: string, idOrSlug: string): Promise<ResolvedEvent> {
  const event = await withTenant(tenantId, (db) =>
    db.event.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], deletedAt: null },
      select: {
        id: true,
        slug: true,
        title: true,
        timezone: true,
        startsAt: true,
        endsAt: true,
        status: true,
        brandId: true,
      },
    }),
  );
  if (!event) throw notFound({ idOrSlug });
  return event;
}

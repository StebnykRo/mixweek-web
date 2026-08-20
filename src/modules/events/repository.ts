import type { Prisma } from '@prisma/client';
import { withTenant, type TenantDb } from '@/lib/db/tenant-client';

export const EVENT_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  coverUrl: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  city: true,
  country: true,
  venueName: true,
  status: true,
  visibility: true,
  audienceRules: true,
  capacity: true,
  waitlistEnabled: true,
  approvalRequired: true,
  registrationEnabled: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  brandId: true,
} satisfies Prisma.EventSelect;

export const EVENT_DETAIL_SELECT = {
  ...EVENT_CARD_SELECT,
  description: true,
  registrationForm: true,
  publishedAt: true,
  archivedAt: true,
} satisfies Prisma.EventSelect;

export type EventCard = Prisma.EventGetPayload<{ select: typeof EVENT_CARD_SELECT }>;
export type EventDetail = Prisma.EventGetPayload<{ select: typeof EVENT_DETAIL_SELECT }>;

/** Only published or archived events are ever visible to a participant. */
export const PARTICIPANT_VISIBLE: Prisma.EventWhereInput = {
  deletedAt: null,
  status: { in: ['PUBLISHED', 'ARCHIVED', 'CANCELLED'] },
};

export function findEvents(tenantId: string, args: Prisma.EventFindManyArgs) {
  return withTenant(tenantId, (db: TenantDb) => db.event.findMany(args as never));
}

export function findEventBySlug(tenantId: string, slug: string, select: Prisma.EventSelect) {
  return withTenant(tenantId, (db: TenantDb) =>
    db.event.findFirst({ where: { slug, ...PARTICIPANT_VISIBLE }, select } as never),
  );
}

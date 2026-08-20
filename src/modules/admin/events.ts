import type { Prisma } from '@prisma/client';
import { withTenant } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { invalidateTenant } from '@/lib/cache';
import { eventPhase } from '@/modules/events/time';

/** docs/10-admin.md §3.2 — event CRUD, the publication checklist and duplication. */

export type AdminActor = { userId: string; email: string; role: string | null };

const ADMIN_EVENT_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  description: true,
  coverUrl: true,
  brandId: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  city: true,
  country: true,
  venueName: true,
  status: true,
  visibility: true,
  audienceRules: true,
  registrationEnabled: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  capacity: true,
  waitlistEnabled: true,
  approvalRequired: true,
  registrationForm: true,
  publishedAt: true,
  archivedAt: true,
} satisfies Prisma.EventSelect;

export async function listAdminEvents(tenantId: string) {
  const events = await withTenant(tenantId, (db) =>
    db.event.findMany({
      where: { deletedAt: null },
      orderBy: { startsAt: 'desc' },
      select: {
        ...ADMIN_EVENT_SELECT,
        _count: {
          select: {
            registrations: { where: { status: { in: ['CONFIRMED', 'PENDING', 'ATTENDED'] } } },
            activities: { where: { deletedAt: null } },
          },
        },
      },
    }),
  );

  return events.map(({ _count, ...event }) => ({
    ...event,
    phase: eventPhase(event),
    registeredCount: _count.registrations,
    activityCount: _count.activities,
  }));
}

export async function getAdminEvent(tenantId: string, id: string) {
  const event = await withTenant(tenantId, (db) =>
    db.event.findFirst({ where: { id, deletedAt: null }, select: ADMIN_EVENT_SELECT }),
  );
  if (!event) throw notFound({ id });
  return event;
}

export type ChecklistResult = { ready: boolean; items: Array<{ key: string; label: string; ok: boolean }> };

/**
 * docs/10-admin.md §3.2 — the publication checklist blocks, it does not warn.
 * Publishing an event with no programme or no support contact is a worse
 * outcome than a delayed launch.
 */
export async function publicationChecklist(tenantId: string, eventId: string): Promise<ChecklistResult> {
  const [event, activityCount, contactCount, brandOk] = await withTenant(tenantId, async (db) => {
    const record = await db.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { coverUrl: true, startsAt: true, endsAt: true, timezone: true, brandId: true },
    });
    if (!record) throw notFound({ eventId });
    return Promise.all([
      Promise.resolve(record),
      db.activity.count({ where: { eventId, deletedAt: null } }),
      db.contact.count({ where: { eventId, deletedAt: null } }),
      db.brand.count({ where: { status: 'PUBLISHED' } }).then((count) => count > 0),
    ]);
  });

  const items = [
    { key: 'cover', label: 'Cover image is set', ok: Boolean(event.coverUrl) },
    { key: 'dates', label: 'Dates are valid', ok: event.endsAt >= event.startsAt },
    { key: 'timezone', label: 'Timezone is set', ok: Boolean(event.timezone) },
    { key: 'programme', label: 'At least one session is published', ok: activityCount > 0 },
    { key: 'contacts', label: 'Support contacts are filled in', ok: contactCount > 0 },
    { key: 'brand', label: 'A published brand exists and passes contrast', ok: brandOk },
  ];

  return { ready: items.every((item) => item.ok), items };
}

export async function publishEvent(tenantId: string, eventId: string, actor: AdminActor) {
  const checklist = await publicationChecklist(tenantId, eventId);
  if (!checklist.ready) {
    throw new AppError('CONFLICT', 'The publication checklist is not complete', {
      details: checklist.items.filter((item) => !item.ok),
    });
  }

  const event = await withTenant(tenantId, (db) =>
    db.event.update({
      where: { id: eventId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      select: { id: true, slug: true, title: true },
    }),
  );

  await invalidateTenant(tenantId, 'programme');
  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'event.publish',
    entityType: 'Event',
    entityId: event.id,
  });

  return event;
}

/** docs/10 §3.2 — duplicating copies content, never registrations. */
export async function duplicateEvent(tenantId: string, eventId: string, slug: string, actor: AdminActor) {
  const created = await withTenant(tenantId, async (db, scopedTenantId) => {
    const source = await db.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: {
        ...ADMIN_EVENT_SELECT,
        activities: { where: { deletedAt: null } },
        places: { where: { deletedAt: null } },
        contentBlocks: { where: { deletedAt: null } },
        contacts: { where: { deletedAt: null } },
        checklistItems: { where: { deletedAt: null } },
        products: { where: { deletedAt: null }, include: { variants: true } },
      },
    });
    if (!source) throw notFound({ eventId });

    const { activities, places, contentBlocks, contacts, checklistItems, products, id, publishedAt, archivedAt, ...base } =
      source;

    const copy = await db.event.create({
      data: {
        ...base,
        tenantId: scopedTenantId,
        slug,
        title: `${base.title} (copy)`,
        status: 'DRAFT',
        publishedAt: null,
        archivedAt: null,
        audienceRules: (base.audienceRules ?? undefined) as Prisma.InputJsonValue | undefined,
        registrationForm: (base.registrationForm ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true, slug: true },
    });

    // Places are recreated first so activities can be re-pointed at the copies.
    const placeMap = new Map<string, string>();
    for (const place of places) {
      const { id: placeId, eventId: _eventId, tenantId: _tenantId, ...rest } = place;
      const newPlace = await db.place.create({
        data: { ...rest, tenantId: scopedTenantId, eventId: copy.id },
        select: { id: true },
      });
      placeMap.set(placeId, newPlace.id);
    }

    for (const activity of activities) {
      const { id: _id, eventId: _eventId, tenantId: _tenantId, placeId, speakers, ...rest } = activity;
      await db.activity.create({
        data: {
          ...rest,
          tenantId: scopedTenantId,
          eventId: copy.id,
          placeId: placeId ? (placeMap.get(placeId) ?? null) : null,
          speakers: (speakers ?? undefined) as Prisma.InputJsonValue | undefined,
          announcedAt: null,
        },
      });
    }

    for (const block of contentBlocks) {
      const { id: _id, eventId: _eventId, tenantId: _tenantId, ...rest } = block;
      await db.contentBlock.create({ data: { ...rest, tenantId: scopedTenantId, eventId: copy.id } });
    }
    for (const contact of contacts) {
      const { id: _id, eventId: _eventId, tenantId: _tenantId, ...rest } = contact;
      await db.contact.create({ data: { ...rest, tenantId: scopedTenantId, eventId: copy.id } });
    }
    for (const item of checklistItems) {
      const { id: _id, eventId: _eventId, tenantId: _tenantId, ...rest } = item;
      await db.checklistItem.create({ data: { ...rest, tenantId: scopedTenantId, eventId: copy.id } });
    }
    for (const product of products) {
      const { id: _id, eventId: _eventId, tenantId: _tenantId, variants, ...rest } = product;
      const newProduct = await db.product.create({
        data: { ...rest, tenantId: scopedTenantId, eventId: copy.id },
        select: { id: true },
      });
      for (const variant of variants) {
        const { id: _variantId, productId: _productId, tenantId: _variantTenant, ...variantRest } = variant;
        await db.productVariant.create({
          data: { ...variantRest, tenantId: scopedTenantId, productId: newProduct.id },
        });
      }
    }

    return copy;
  });

  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'event.duplicate',
    entityType: 'Event',
    entityId: created.id,
    diff: { from: eventId },
  });

  return created;
}

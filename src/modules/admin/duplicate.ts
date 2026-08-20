import { withTenant } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';

export type DuplicateInput = {
  tenantId: string;
  sourceEventId: string;
  slug: string;
  title: string;
  startsAt: Date;
};

export type DuplicateResult = {
  id: string;
  slug: string;
  copied: Record<string, number>;
};

/**
 * docs/10-admin.md §3.2 — build next year's event from last year's.
 *
 * What is copied is the shape of the event: places, the programme, the
 * content pages, the checklist, contacts and the merchandise catalogue.
 *
 * What is NOT copied is anything belonging to a person — registrations,
 * orders, announcements already sent, notifications, analytics. Those are a
 * record of what happened at the old event, and carrying them into a new one
 * would both be wrong and quietly leak last year's attendee list into a
 * fresh event.
 *
 * Times move with the event: every activity keeps its offset from day one, so
 * a 09:00 breakfast on the second morning stays exactly that.
 */
export async function duplicateEvent(input: DuplicateInput): Promise<DuplicateResult> {
  return withTenant(input.tenantId, async (db, tenantId) => {
    const source = await db.event.findFirst({
      where: { id: input.sourceEventId, deletedAt: null },
      select: {
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
        visibility: true,
        audienceRules: true,
        registrationEnabled: true,
        capacity: true,
        waitlistEnabled: true,
        approvalRequired: true,
        registrationForm: true,
      },
    });
    if (!source) throw notFound({ eventId: input.sourceEventId });

    const clash = await db.event.findFirst({ where: { slug: input.slug }, select: { id: true } });
    if (clash) throw new AppError('VALIDATION_FAILED', `An event with the slug "${input.slug}" already exists`);

    // Everything shifts by the same amount, so the programme keeps its shape.
    const shiftMs = input.startsAt.getTime() - source.startsAt.getTime();
    const shift = (date: Date): Date => new Date(date.getTime() + shiftMs);

    const created = await db.event.create({
      data: {
        tenantId,
        slug: input.slug,
        title: input.title,
        subtitle: source.subtitle,
        description: source.description,
        coverUrl: source.coverUrl,
        brandId: source.brandId,
        startsAt: input.startsAt,
        endsAt: shift(source.endsAt),
        timezone: source.timezone,
        city: source.city,
        country: source.country,
        venueName: source.venueName,
        visibility: source.visibility,
        audienceRules: (source.audienceRules ?? undefined) as never,
        registrationEnabled: source.registrationEnabled,
        // Deliberately not copied: the old registration window is in the past.
        registrationOpensAt: null,
        registrationClosesAt: null,
        capacity: source.capacity,
        waitlistEnabled: source.waitlistEnabled,
        approvalRequired: source.approvalRequired,
        registrationForm: (source.registrationForm ?? undefined) as never,
        // Always a draft: nobody should discover a copy by finding it live.
        status: 'DRAFT',
      },
      select: { id: true, slug: true },
    });

    const copied: Record<string, number> = {};

    const places = await db.place.findMany({
      where: { eventId: input.sourceEventId, deletedAt: null },
      select: {
        id: true, name: true, kind: true, description: true, mapX: true, mapY: true,
        lat: true, lng: true, address: true, openingHours: true, imageUrl: true, sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Activities reference places by id, so the new ids have to be known first.
    const placeIdMap = new Map<string, string>();
    for (const place of places) {
      const { id: oldId, ...rest } = place;
      const fresh = await db.place.create({
        data: { ...rest, tenantId, eventId: created.id },
        select: { id: true },
      });
      placeIdMap.set(oldId, fresh.id);
    }
    copied.places = places.length;

    const activities = await db.activity.findMany({
      where: { eventId: input.sourceEventId, deletedAt: null },
      select: {
        title: true, description: true, track: true, startsAt: true, endsAt: true,
        placeId: true, locationText: true, speakers: true, bookingRequired: true,
        capacity: true, waitlistEnabled: true, isFeatured: true, isMandatory: true, sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    });
    for (const activity of activities) {
      await db.activity.create({
        data: {
          ...activity,
          speakers: (activity.speakers ?? undefined) as never,
          tenantId,
          eventId: created.id,
          startsAt: shift(activity.startsAt),
          endsAt: shift(activity.endsAt),
          placeId: activity.placeId ? (placeIdMap.get(activity.placeId) ?? null) : null,
          // Booking windows are relative to the old dates; let the organiser
          // set them again rather than inherit something already closed.
          bookingOpensAt: null,
          bookingClosesAt: null,
          status: 'SCHEDULED',
          announcedAt: null,
        },
      });
    }
    copied.activities = activities.length;

    const blocks = await db.contentBlock.findMany({
      where: { eventId: input.sourceEventId, deletedAt: null },
      select: { section: true, key: true, title: true, body: true, icon: true, imageUrl: true, sortOrder: true, isPublished: true },
    });
    for (const block of blocks) {
      await db.contentBlock.create({ data: { ...block, tenantId, eventId: created.id } });
    }
    copied.content = blocks.length;

    const checklist = await db.checklistItem.findMany({
      where: { eventId: input.sourceEventId, deletedAt: null },
      select: { label: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
    for (const item of checklist) {
      await db.checklistItem.create({ data: { ...item, tenantId, eventId: created.id } });
    }
    copied.checklist = checklist.length;

    const contacts = await db.contact.findMany({
      where: { eventId: input.sourceEventId, deletedAt: null },
      select: { kind: true, name: true, role: true, email: true, phone: true, note: true, isUrgent: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
    for (const contact of contacts) {
      await db.contact.create({ data: { ...contact, tenantId, eventId: created.id } });
    }
    copied.contacts = contacts.length;

    const products = await db.product.findMany({
      where: { eventId: input.sourceEventId, deletedAt: null },
      select: {
        sku: true, name: true, description: true, imageUrl: true, priceCents: true,
        currency: true, isActive: true, perUserLimit: true, sortOrder: true,
        variants: { select: { size: true, stockTotal: true, isActive: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    for (const product of products) {
      const { variants, ...rest } = product;
      await db.product.create({
        data: {
          ...rest,
          tenantId,
          eventId: created.id,
          // Stock is carried over as the catalogue's intent; reservations are
          // not, so availability starts full.
          variants: { create: variants.map((variant) => ({ ...variant, tenantId })) },
        },
      });
    }
    copied.products = products.length;

    return { id: created.id, slug: created.slug, copied };
  });
}

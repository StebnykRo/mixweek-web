import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant-client';
import { cancelRegistration, registerForEvent } from '@/modules/registrations/service';
import { bookActivity, cancelBooking } from '@/modules/registrations/bookings';
import { reserveOrder } from '@/modules/merch/service';
import { adminDb, createTenantFixture, resetDatabase, type TenantFixture } from '../fixtures';

/**
 * docs/14-qa.md §2.3 and docs/06 §4.3 — the no-overbooking guarantee.
 *
 * These run real concurrent transactions against Postgres. A mock would prove
 * nothing here: the guarantee comes from row locks and a partial unique index.
 */

let fixture: TenantFixture;

afterAll(async () => {
  await resetDatabase();
  await adminDb.$disconnect();
  await prisma.$disconnect();
});

const register = (tenantId: string, eventId: string, userId: string) =>
  registerForEvent({
    tenantId,
    eventId,
    userId,
    answers: {},
    actorEmail: 'test@example.test',
    ip: null,
    userAgent: null,
  });

describe('event registration under load', () => {
  beforeEach(async () => {
    await resetDatabase();
    fixture = await createTenantFixture({ slug: 'conc', userCount: 50, capacity: 10 });
  });

  it('gives exactly ten places to fifty simultaneous registrations', async () => {
    const results = await Promise.allSettled(
      fixture.users.map((user) => register(fixture.tenantId, fixture.eventId, user.id)),
    );

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled).toHaveLength(50);

    const confirmed = await adminDb.eventRegistration.count({
      where: { eventId: fixture.eventId, status: 'CONFIRMED' },
    });
    const waitlisted = await adminDb.eventRegistration.count({
      where: { eventId: fixture.eventId, status: 'WAITLISTED' },
    });

    expect(confirmed).toBe(10);
    expect(waitlisted).toBe(40);
  });

  it('numbers the waiting list contiguously from one', async () => {
    await Promise.allSettled(fixture.users.map((user) => register(fixture.tenantId, fixture.eventId, user.id)));

    const queue = await adminDb.eventRegistration.findMany({
      where: { eventId: fixture.eventId, status: 'WAITLISTED' },
      orderBy: { waitlistPosition: 'asc' },
      select: { waitlistPosition: true },
    });

    expect(queue.map((entry) => entry.waitlistPosition)).toEqual(
      Array.from({ length: queue.length }, (_, index) => index + 1),
    );
  });

  it('refuses a second registration from the same person', async () => {
    const user = fixture.users[0]!;
    await register(fixture.tenantId, fixture.eventId, user.id);
    await expect(register(fixture.tenantId, fixture.eventId, user.id)).rejects.toThrow(/already registered/i);

    const count = await adminDb.eventRegistration.count({
      where: { eventId: fixture.eventId, userId: user.id },
    });
    expect(count).toBe(1);
  });

  it('creates exactly one row when the same person double-submits', async () => {
    const user = fixture.users[0]!;
    const results = await Promise.allSettled([
      register(fixture.tenantId, fixture.eventId, user.id),
      register(fixture.tenantId, fixture.eventId, user.id),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await adminDb.eventRegistration.count({ where: { eventId: fixture.eventId, userId: user.id } }),
    ).toBe(1);
  });

  it('promotes exactly one person when a confirmed place is released', async () => {
    await Promise.allSettled(fixture.users.map((user) => register(fixture.tenantId, fixture.eventId, user.id)));

    const confirmed = await adminDb.eventRegistration.findFirst({
      where: { eventId: fixture.eventId, status: 'CONFIRMED' },
      select: { userId: true },
    });

    const outcome = await cancelRegistration({
      tenantId: fixture.tenantId,
      eventId: fixture.eventId,
      userId: confirmed!.userId!,
      actorEmail: 'test@example.test',
      ip: null,
    });

    expect(outcome.promotedUserId).not.toBeNull();
    expect(await adminDb.eventRegistration.count({ where: { eventId: fixture.eventId, status: 'CONFIRMED' } })).toBe(10);
    expect(await adminDb.eventRegistration.count({ where: { eventId: fixture.eventId, status: 'WAITLISTED' } })).toBe(39);
  });

  it('never exceeds capacity when several people cancel at once', async () => {
    await Promise.allSettled(fixture.users.map((user) => register(fixture.tenantId, fixture.eventId, user.id)));

    const confirmed = await adminDb.eventRegistration.findMany({
      where: { eventId: fixture.eventId, status: 'CONFIRMED' },
      select: { userId: true },
      take: 5,
    });

    await Promise.allSettled(
      confirmed.map((registration) =>
        cancelRegistration({
          tenantId: fixture.tenantId,
          eventId: fixture.eventId,
          userId: registration.userId!,
          actorEmail: 'test@example.test',
          ip: null,
        }),
      ),
    );

    const stillConfirmed = await adminDb.eventRegistration.count({
      where: { eventId: fixture.eventId, status: 'CONFIRMED' },
    });
    expect(stillConfirmed).toBe(10);
  });

  it('confirms everyone when the event has no capacity limit', async () => {
    const open = await createTenantFixture({ slug: 'openreg', userCount: 20, capacity: null });
    await Promise.allSettled(open.users.map((user) => register(open.tenantId, open.eventId, user.id)));

    expect(await adminDb.eventRegistration.count({ where: { eventId: open.eventId, status: 'CONFIRMED' } })).toBe(20);
  });
});

describe('activity booking under load', () => {
  it('gives exactly five seats to twenty simultaneous bookings', async () => {
    await resetDatabase();
    const seats = await createTenantFixture({ slug: 'seats', userCount: 20, activityCapacity: 5 });

    await Promise.allSettled(
      seats.users.map((user) =>
        bookActivity({
          tenantId: seats.tenantId,
          activityId: seats.activityId,
          userId: user.id,
          actorEmail: 'test@example.test',
          ip: null,
        }),
      ),
    );

    expect(await adminDb.activityBooking.count({ where: { activityId: seats.activityId, status: 'BOOKED' } })).toBe(5);
    expect(
      await adminDb.activityBooking.count({ where: { activityId: seats.activityId, status: 'WAITLISTED' } }),
    ).toBe(15);
  });

  it('promotes one person from the activity waiting list on cancellation', async () => {
    await resetDatabase();
    const seats = await createTenantFixture({ slug: 'seats2', userCount: 8, activityCapacity: 2 });

    for (const user of seats.users) {
      await bookActivity({
        tenantId: seats.tenantId,
        activityId: seats.activityId,
        userId: user.id,
        actorEmail: 'test@example.test',
        ip: null,
      }).catch(() => undefined);
    }

    const booked = await adminDb.activityBooking.findFirst({
      where: { activityId: seats.activityId, status: 'BOOKED' },
      select: { userId: true },
    });

    const outcome = await cancelBooking({
      tenantId: seats.tenantId,
      activityId: seats.activityId,
      userId: booked!.userId,
      actorEmail: 'test@example.test',
      ip: null,
    });

    expect(outcome.promotedUserId).not.toBeNull();
    expect(await adminDb.activityBooking.count({ where: { activityId: seats.activityId, status: 'BOOKED' } })).toBe(2);
  });
});

describe('merch reservation under load', () => {
  it('never reserves more than the stock', async () => {
    await resetDatabase();
    const merch = await createTenantFixture({ slug: 'merch', userCount: 20 });

    const product = await adminDb.product.create({
      data: {
        tenantId: merch.tenantId,
        eventId: merch.eventId,
        sku: 'TEE',
        name: 'T-shirt',
        priceCents: 0,
        perUserLimit: 1,
      },
    });
    const variant = await adminDb.productVariant.create({
      data: { tenantId: merch.tenantId, productId: product.id, size: 'M', stockTotal: 3 },
    });

    const results = await Promise.allSettled(
      merch.users.map((user) =>
        reserveOrder({
          tenantId: merch.tenantId,
          eventId: merch.eventId,
          userId: user.id,
          actorEmail: 'test@example.test',
          items: [{ variantId: variant.id, quantity: 1 }],
        }),
      ),
    );

    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    expect(succeeded).toBe(3);

    const reserved = await adminDb.orderItem.aggregate({
      where: { variantId: variant.id, order: { status: 'RESERVED' } },
      _sum: { quantity: true },
    });
    expect(reserved._sum.quantity).toBe(3);
  });

  it('enforces the per-user limit', async () => {
    await resetDatabase();
    const merch = await createTenantFixture({ slug: 'merch2', userCount: 1 });

    const product = await adminDb.product.create({
      data: {
        tenantId: merch.tenantId,
        eventId: merch.eventId,
        sku: 'HOODIE',
        name: 'Hoodie',
        priceCents: 0,
        perUserLimit: 1,
      },
    });
    const variant = await adminDb.productVariant.create({
      data: { tenantId: merch.tenantId, productId: product.id, size: 'L', stockTotal: 50 },
    });

    const user = merch.users[0]!;
    await reserveOrder({
      tenantId: merch.tenantId,
      eventId: merch.eventId,
      userId: user.id,
      actorEmail: 'test@example.test',
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    await expect(
      reserveOrder({
        tenantId: merch.tenantId,
        eventId: merch.eventId,
        userId: user.id,
        actorEmail: 'test@example.test',
        items: [{ variantId: variant.id, quantity: 1 }],
      }),
    ).rejects.toThrow(/limit/i);
  });

  it('issues a unique order number per reservation', async () => {
    await resetDatabase();
    const merch = await createTenantFixture({ slug: 'merch3', userCount: 10 });

    const product = await adminDb.product.create({
      data: { tenantId: merch.tenantId, eventId: merch.eventId, sku: 'CAP', name: 'Cap', priceCents: 0, perUserLimit: 1 },
    });
    const variant = await adminDb.productVariant.create({
      data: { tenantId: merch.tenantId, productId: product.id, size: 'ONE', stockTotal: 100 },
    });

    await Promise.allSettled(
      merch.users.map((user) =>
        reserveOrder({
          tenantId: merch.tenantId,
          eventId: merch.eventId,
          userId: user.id,
          actorEmail: 'test@example.test',
          items: [{ variantId: variant.id, quantity: 1 }],
        }),
      ),
    );

    const orders = await adminDb.order.findMany({ where: { eventId: merch.eventId }, select: { number: true } });
    expect(new Set(orders.map((order) => order.number)).size).toBe(orders.length);
    expect(orders.length).toBe(10);
  });
});

describe('the guard holds inside a transaction', () => {
  it('still scopes nested service calls', async () => {
    await resetDatabase();
    const fresh = await createTenantFixture({ slug: 'nested', userCount: 1, capacity: 5 });

    const seen = await withTenant(fresh.tenantId, async (db) => {
      await register(fresh.tenantId, fresh.eventId, fresh.users[0]!.id);
      return db.eventRegistration.count();
    });

    expect(seen).toBe(1);
  });
});

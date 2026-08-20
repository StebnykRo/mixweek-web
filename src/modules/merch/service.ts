import { globalDb } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { randomBase32Code, sha256 } from '@/lib/crypto/hash';
import { eventPhase } from '@/modules/events/time';
import { issueSignedToken } from '@/modules/checkin/tokens';

/**
 * docs/07-screens.md §11 — WinStyle: reserve and collect, no payment in v1.
 *
 * `reserved` is derived from OrderItem rather than denormalised onto the
 * variant (docs/02), so there is no counter to drift. The variant row is locked
 * for the duration of the transaction, which is what keeps the reservation from
 * exceeding stock under load.
 */

export type ProductView = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  priceCents: number;
  currency: string;
  perUserLimit: number;
  variants: Array<{ id: string; size: string; stockTotal: number; reserved: number; available: number }>;
};

export async function listProducts(tenantId: string, eventId: string): Promise<ProductView[]> {
  return withTenant(tenantId, async (db) => {
    const products = await db.product.findMany({
      where: { eventId, isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        imageUrl: true,
        priceCents: true,
        currency: true,
        perUserLimit: true,
        variants: {
          where: { isActive: true },
          orderBy: { size: 'asc' },
          select: { id: true, size: true, stockTotal: true },
        },
      },
    });

    const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
    const reservations = variantIds.length
      ? await db.orderItem.groupBy({
          by: ['variantId'],
          where: { variantId: { in: variantIds }, order: { status: { in: ['RESERVED', 'READY_FOR_PICKUP', 'PICKED_UP'] } } },
          _sum: { quantity: true },
        })
      : [];
    const reservedByVariant = new Map(reservations.map((r) => [r.variantId, r._sum.quantity ?? 0]));

    return products.map((product) => ({
      ...product,
      variants: product.variants.map((variant) => {
        const reserved = reservedByVariant.get(variant.id) ?? 0;
        return { ...variant, reserved, available: Math.max(0, variant.stockTotal - reserved) };
      }),
    }));
  });
}

export type ReserveInput = {
  tenantId: string;
  eventId: string;
  userId: string;
  actorEmail: string;
  items: Array<{ variantId: string; quantity: number }>;
};

export type ReserveResult = { orderId: string; number: string; pickupCode: string };

export async function reserveOrder(input: ReserveInput): Promise<ReserveResult> {
  const result = await withTenant(input.tenantId, async (db, tenantId) => {
    const event = await db.event.findFirst({
      where: { id: input.eventId, deletedAt: null },
      select: { id: true, startsAt: true, endsAt: true, timezone: true, status: true },
    });
    if (!event) throw notFound({ eventId: input.eventId });
    if (eventPhase(event) === 'past') throw new AppError('EVENT_ENDED');

    const variantIds = input.items.map((item) => item.variantId);
    // Lock the variant rows first, in a deterministic order, so two concurrent
    // reservations for the same items cannot deadlock each other.
    await db.$executeRaw`SELECT id FROM "ProductVariant" WHERE id = ANY(${variantIds}::text[]) ORDER BY id FOR UPDATE`;

    const variants = await db.productVariant.findMany({
      where: { id: { in: variantIds }, isActive: true },
      select: {
        id: true,
        size: true,
        stockTotal: true,
        product: { select: { id: true, eventId: true, priceCents: true, perUserLimit: true, isActive: true, name: true } },
      },
    });
    if (variants.length !== variantIds.length) throw notFound({ variantIds });

    for (const variant of variants) {
      if (!variant.product.isActive || variant.product.eventId !== event.id) throw notFound({ variantId: variant.id });
    }

    const reservations = await db.orderItem.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds }, order: { status: { in: ['RESERVED', 'READY_FOR_PICKUP', 'PICKED_UP'] } } },
      _sum: { quantity: true },
    });
    const reservedByVariant = new Map(reservations.map((r) => [r.variantId, r._sum.quantity ?? 0]));

    for (const item of input.items) {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant) throw notFound({ variantId: item.variantId });
      const available = variant.stockTotal - (reservedByVariant.get(variant.id) ?? 0);
      if (item.quantity > available) throw new AppError('OUT_OF_STOCK', `${variant.product.name} (${variant.size}) is no longer available`);

      // docs/07 §11 — per-user limit is counted across the user's live orders.
      const alreadyForProduct = await db.orderItem.aggregate({
        where: {
          order: { userId: input.userId, eventId: event.id, status: { in: ['RESERVED', 'READY_FOR_PICKUP', 'PICKED_UP'] } },
          variant: { productId: variant.product.id },
        },
        _sum: { quantity: true },
      });
      if ((alreadyForProduct._sum.quantity ?? 0) + item.quantity > variant.product.perUserLimit) {
        throw new AppError('LIMIT_EXCEEDED', `Limit of ${variant.product.perUserLimit} reached for ${variant.product.name}`);
      }
    }

    const sequence = await nextOrderNumber();
    const number = `MW-${String(sequence).padStart(4, '0')}`;
    const pickupCode = randomBase32Code(8);

    const order = await db.order.create({
      data: {
        tenantId,
        eventId: event.id,
        userId: input.userId,
        number,
        status: 'RESERVED',
        pickupCodeHash: sha256(`${event.id}:${pickupCode}`),
        items: {
          create: input.items.map((item) => {
            const variant = variants.find((v) => v.id === item.variantId);
            return {
              tenantId,
              variantId: item.variantId,
              quantity: item.quantity,
              priceCents: variant?.product.priceCents ?? 0,
            };
          }),
        },
      },
      select: { id: true, number: true },
    });

    return { orderId: order.id, number: order.number, pickupCode };
  });

  await auditLog({
    tenantId: input.tenantId,
    actorId: input.userId,
    actorEmail: input.actorEmail,
    action: 'order.reserve',
    entityType: 'Order',
    entityId: result.orderId,
    diff: { items: input.items.length },
  });

  return result;
}

/**
 * A database sequence, so two concurrent reservations cannot take one number.
 * The sequence is global rather than tenant-scoped, which is why it uses the
 * global client (docs/02 §3).
 */
async function nextOrderNumber(): Promise<number> {
  const rows = await globalDb.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('order_number_seq')`;
  return Number(rows[0]?.nextval ?? 1);
}

export async function getMyOrder(tenantId: string, eventId: string, userId: string) {
  return withTenant(tenantId, (db) =>
    db.order.findFirst({
      where: { eventId, userId, status: { in: ['RESERVED', 'READY_FOR_PICKUP', 'PICKED_UP'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        pickedUpAt: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            priceCents: true,
            variant: { select: { size: true, product: { select: { name: true, imageUrl: true, currency: true } } } },
          },
        },
      },
    }),
  );
}

export async function cancelOrder(input: { tenantId: string; orderId: string; userId: string; actorEmail: string }) {
  await withTenant(input.tenantId, async (db) => {
    const order = await db.order.findFirst({
      where: { id: input.orderId, userId: input.userId, status: 'RESERVED' },
      select: { id: true },
    });
    if (!order) throw notFound({ orderId: input.orderId });
    await db.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), pickupCodeHash: null },
    });
  });

  await auditLog({
    tenantId: input.tenantId,
    actorId: input.userId,
    actorEmail: input.actorEmail,
    action: 'order.cancel',
    entityType: 'Order',
    entityId: input.orderId,
  });
}

export async function issuePickupToken(tenantId: string, orderId: string, userId: string) {
  const order = await withTenant(tenantId, (db) =>
    db.order.findFirst({
      where: { id: orderId, userId, status: { in: ['RESERVED', 'READY_FOR_PICKUP'] } },
      select: { id: true },
    }),
  );
  if (!order) throw notFound({ orderId });
  return issueSignedToken('pickup', order.id, tenantId);
}

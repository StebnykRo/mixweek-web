-- docs/02-data-model.md §3 — constraints and indexes beyond @@index.

CREATE SEQUENCE IF NOT EXISTS order_number_seq;

-- Fast "now / next" lookup.
CREATE INDEX IF NOT EXISTS activity_now_next_idx
  ON "Activity" ("eventId", "startsAt", "endsAt")
  WHERE "deletedAt" IS NULL AND status <> 'CANCELLED';

-- Programme search.
CREATE INDEX IF NOT EXISTS activity_title_trgm_idx ON "Activity" USING gin (title gin_trgm_ops);

-- At most one active registration per (event, user).
CREATE UNIQUE INDEX IF NOT EXISTS registration_active_uniq
  ON "EventRegistration" ("eventId", "userId")
  WHERE status IN ('PENDING', 'CONFIRMED', 'WAITLISTED');

-- Time sanity.
ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS activity_time_valid;
ALTER TABLE "Activity" ADD CONSTRAINT activity_time_valid CHECK ("endsAt" > "startsAt");
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS event_time_valid;
ALTER TABLE "Event" ADD CONSTRAINT event_time_valid CHECK ("endsAt" >= "startsAt");

-- Capacity sanity.
ALTER TABLE "Activity" DROP CONSTRAINT IF EXISTS activity_capacity_positive;
ALTER TABLE "Activity" ADD CONSTRAINT activity_capacity_positive CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS event_capacity_positive;
ALTER TABLE "Event" ADD CONSTRAINT event_capacity_positive CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE "ProductVariant" DROP CONSTRAINT IF EXISTS stock_nonneg;
ALTER TABLE "ProductVariant" ADD CONSTRAINT stock_nonneg CHECK ("stockTotal" >= 0);
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS order_item_qty_positive;
ALTER TABLE "OrderItem" ADD CONSTRAINT order_item_qty_positive CHECK (quantity > 0);

-- Cursor pagination on notification history.
CREATE INDEX IF NOT EXISTS delivery_user_created_idx
  ON "NotificationDelivery" ("userId", "createdAt" DESC);

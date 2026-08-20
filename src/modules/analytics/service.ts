import { z } from 'zod';
import { withTenant } from '@/lib/db/tenant-client';
import { hmac } from '@/lib/crypto/hash';
import { getSecret, setSecret } from '@/lib/crypto/secrets';
import { randomToken } from '@/lib/crypto/hash';
import { getSetting } from '@/modules/tenancy/settings';

/**
 * docs/13-nfr.md §8 — our own table, no third-party tracker, no cookie.
 *
 * The subject is HMAC(userId, analytics.pepper). Rotating the pepper once a
 * year deliberately severs the link between historical events and the person —
 * that is a feature, not an inconvenience.
 */

export const ANALYTICS_EVENTS = [
  'screen.view',
  'activity.save',
  'activity.book',
  'event.register',
  'media.open',
  'merch.reserve',
  'pwa.install',
  'push.permission',
  'filter.apply',
  'search.query',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

/** props carry ids and enum values only — no free text, no PII (docs/13 §8). */
const PropValueSchema = z.union([z.string().max(64).regex(/^[A-Za-z0-9_.:-]*$/), z.number(), z.boolean()]);

export const AnalyticsEventSchema = z.strictObject({
  name: z.enum(ANALYTICS_EVENTS),
  eventId: z.string().max(32).optional(),
  props: z.record(PropValueSchema).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const AnalyticsBatchSchema = z.strictObject({
  events: z.array(AnalyticsEventSchema).min(1).max(20),
});

export type AnalyticsBatch = z.infer<typeof AnalyticsBatchSchema>;

async function pepper(): Promise<string> {
  const existing = await getSecret('analytics.pepper');
  if (existing) return existing;
  const generated = randomToken(32);
  await setSecret({}, 'analytics.pepper', generated, { userId: null });
  return generated;
}

export async function subjectHashFor(userId: string): Promise<string> {
  return hmac(userId, await pepper());
}

export async function recordBatch(tenantId: string, userId: string, batch: AnalyticsBatch): Promise<number> {
  if (!(await getSetting('analytics.enabled', { tenantId }))) return 0;

  const subjectHash = await subjectHashFor(userId);
  return withTenant(tenantId, async (db, scopedTenantId) => {
    const result = await db.analyticsEvent.createMany({
      data: batch.events.map((event) => ({
        tenantId: scopedTenantId,
        eventId: event.eventId ?? null,
        subjectHash,
        name: event.name,
        props: (event.props ?? {}) as never,
        occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
      })),
    });
    return result.count;
  });
}

/** docs/10 §3.12a — aggregates only; raw events are never shown in the UI. */
export type InsightsRange = { from: Date; to: Date };

export const MIN_GROUP_SIZE = 5;

export async function getInsights(tenantId: string, eventId: string | null, range: InsightsRange) {
  return withTenant(tenantId, async (db) => {
    const where = {
      occurredAt: { gte: range.from, lte: range.to },
      ...(eventId ? { eventId } : {}),
    };

    const byName = await db.analyticsEvent.groupBy({
      by: ['name'],
      where,
      _count: { _all: true },
    });
    const counts = new Map(byName.map((row) => [row.name, row._count._all]));

    const [registrations, bookings, saves] = await Promise.all([
      eventId
        ? db.eventRegistration.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } })
        : Promise.resolve([]),
      eventId
        ? db.activityBooking.groupBy({
            by: ['activityId'],
            where: { activity: { eventId } },
            _count: { _all: true },
            orderBy: { _count: { activityId: 'desc' } },
            take: 10,
          })
        : Promise.resolve([]),
      eventId
        ? db.savedActivity.groupBy({
            by: ['activityId'],
            where: { activity: { eventId } },
            _count: { _all: true },
            orderBy: { _count: { activityId: 'desc' } },
            take: 10,
          })
        : Promise.resolve([]),
    ]);

    // docs/10 §3.12a — a department breakdown below the minimum group size
    // would re-identify people, so small groups are folded into "Other".
    const departments = eventId
      ? await db.eventRegistration.findMany({
          where: { eventId, userId: { not: null } },
          select: { user: { select: { department: true } } },
        })
      : [];
    const byDepartment = new Map<string, number>();
    for (const row of departments) {
      const key = row.user?.department ?? 'Unspecified';
      byDepartment.set(key, (byDepartment.get(key) ?? 0) + 1);
    }
    let suppressed = 0;
    const departmentRows: Array<{ department: string; count: number }> = [];
    for (const [department, count] of byDepartment) {
      if (count < MIN_GROUP_SIZE) suppressed += count;
      else departmentRows.push({ department, count });
    }
    if (suppressed > 0) departmentRows.push({ department: 'Other (small groups)', count: suppressed });

    return {
      funnel: {
        eventViews: counts.get('screen.view') ?? 0,
        registrationStarts: counts.get('filter.apply') ?? 0,
        registrations: counts.get('event.register') ?? 0,
      },
      registrationsByStatus: registrations.map((r) => ({ status: r.status, count: r._count._all })),
      topBooked: bookings.map((b) => ({ activityId: b.activityId, count: b._count._all })),
      topSaved: saves.map((s) => ({ activityId: s.activityId, count: s._count._all })),
      pwaInstalls: counts.get('pwa.install') ?? 0,
      pushPermissions: counts.get('push.permission') ?? 0,
      mediaOpens: counts.get('media.open') ?? 0,
      departments: departmentRows.sort((a, b) => b.count - a.count),
    };
  });
}

/** docs/02 §5 — raw events are kept for 90 days; aggregates survive. */
export async function purgeOldAnalytics(tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return withTenant(tenantId, async (db) => {
    const result = await db.analyticsEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });
    return result.count;
  });
}

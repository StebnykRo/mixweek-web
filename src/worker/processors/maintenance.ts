import { globalDb } from '@/lib/db/client';
import { withSystemScope, withTenant } from '@/lib/db/tenant-client';
import { logger } from '@/lib/logger';
import { RETENTION_DAYS, DELETION_GRACE_DAYS } from '@/modules/admin/constants';

/**
 * docs/02-data-model.md §5 — retention. Data that is no longer needed is a
 * liability, so the clean-up is a scheduled job rather than a manual chore.
 */
export type MaintenanceJob = {
  task: 'purge-tokens' | 'purge-sessions' | 'purge-analytics' | 'expire-orders' | 'rotate-secrets';
};

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

export async function processMaintenance(job: MaintenanceJob): Promise<Record<string, number>> {
  switch (job.task) {
    case 'purge-tokens': {
      const tokens = await globalDb.verificationToken.deleteMany({
        where: { expiresAt: { lt: daysAgo(RETENTION_DAYS.verificationToken) } },
      });
      const devices = await globalDb.trustedDevice.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      return { tokens: tokens.count, trustedDevices: devices.count };
    }

    case 'purge-sessions': {
      const sessions = await globalDb.session.deleteMany({
        where: { expiresAt: { lt: daysAgo(RETENTION_DAYS.session) } },
      });
      const attempts = await globalDb.loginAttempt.deleteMany({
        where: { createdAt: { lt: daysAgo(RETENTION_DAYS.loginAttempt) } },
      });
      return { sessions: sessions.count, loginAttempts: attempts.count };
    }

    case 'purge-analytics': {
      const analytics = await withSystemScope('retention purge analytics', (db) =>
        db.analyticsEvent.deleteMany({ where: { occurredAt: { lt: daysAgo(RETENTION_DAYS.analyticsEvent) } } }),
      );
      const deliveries = await withSystemScope('retention purge deliveries', (db) =>
        db.notificationDelivery.deleteMany({
          where: { createdAt: { lt: daysAgo(RETENTION_DAYS.notificationDelivery) } },
        }),
      );
      const reports = await withSystemScope('retention purge media reports', (db) =>
        db.mediaReport.deleteMany({
          where: {
            status: { in: ['RESOLVED', 'DISMISSED'] },
            resolvedAt: { lt: daysAgo(RETENTION_DAYS.mediaReportClosed) },
          },
        }),
      );
      // Registrations for long-past events keep their aggregate value but lose
      // the person: userId is nulled, the row stays.
      const anonymised = await withSystemScope('retention anonymise registrations', (db) =>
        db.eventRegistration.updateMany({
          where: {
            userId: { not: null },
            event: { endsAt: { lt: daysAgo(RETENTION_DAYS.pastRegistration) } },
          },
          data: { userId: null, answers: undefined },
        }),
      );
      return {
        analytics: analytics.count,
        deliveries: deliveries.count,
        mediaReports: reports.count,
        anonymisedRegistrations: anonymised.count,
      };
    }

    case 'expire-orders': {
      // docs/07 §11 — a reservation that was never collected frees its stock
      // once the event is over.
      const expired = await withSystemScope('expire merch reservations', (db) =>
        db.order.updateMany({
          where: { status: 'RESERVED', event: { endsAt: { lt: new Date() } } },
          data: { status: 'EXPIRED', pickupCodeHash: null },
        }),
      );
      return { orders: expired.count };
    }

    case 'rotate-secrets': {
      // docs/12 §2.2 — the previous version of a rotated secret is kept for 24 h
      // for a graceful transition, then removed.
      const stale = await withSystemScope('purge rotated secrets', (db) =>
        db.secretSetting.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      );
      return { secrets: stale.count };
    }

    default:
      return {};
  }
}

/** docs/03 §10 — hard deletion once the 30-day grace period has run out. */
export async function processAccountDeletions(): Promise<{ deleted: number }> {
  const due = await globalDb.user.findMany({
    where: { deletionRequestedAt: { lt: daysAgo(DELETION_GRACE_DAYS) } },
    select: { id: true, email: true },
  });

  for (const user of due) {
    // Registrations survive as anonymous rows; everything that identifies the
    // person goes.
    await withSystemScope('gdpr anonymise registrations', (db) =>
      db.eventRegistration.updateMany({ where: { userId: user.id }, data: { userId: null, answers: undefined } }),
    );
    await globalDb.user.delete({ where: { id: user.id } });
    logger.info({ action: 'gdpr.hard_delete', entityId: user.id }, 'account-deleted');
  }

  return { deleted: due.length };
}

/** docs/11 §5 — the six-hour PROGRAMME_UPDATE window, closed on a schedule. */
export async function processProgrammeAnnouncements(): Promise<{ announced: number }> {
  const { announcePendingActivities } = await import('@/modules/admin/programme');
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const candidates = await withSystemScope('find events with unannounced sessions', (db) =>
    db.activity.groupBy({
      by: ['tenantId', 'eventId'],
      where: { announcedAt: null, deletedAt: null, createdAt: { lt: cutoff }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    }),
  );

  let announced = 0;
  for (const candidate of candidates) {
    const result = await announcePendingActivities(candidate.tenantId, candidate.eventId);
    announced += result.announced;
  }
  return { announced };
}

/** docs/11 §5 — a reminder 15 minutes before anything in someone's programme. */
export async function processReminders(): Promise<{ sent: number }> {
  const { enqueueNotification } = await import('@/modules/notifications/dispatch');
  const now = new Date();
  const windowStart = new Date(now.getTime() + 14 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 16 * 60 * 1000);

  const upcoming = await withSystemScope('find sessions starting soon', (db) =>
    db.activity.findMany({
      where: {
        deletedAt: null,
        status: { not: 'CANCELLED' },
        startsAt: { gte: windowStart, lt: windowEnd },
        event: { status: 'PUBLISHED' },
      },
      select: {
        id: true,
        tenantId: true,
        title: true,
        startsAt: true,
        place: { select: { name: true } },
        event: { select: { id: true, slug: true, timezone: true } },
      },
    }),
  );

  for (const activity of upcoming) {
    await enqueueNotification({
      tenantId: activity.tenantId,
      eventId: activity.event.id,
      kind: 'REMINDER',
      title: `${activity.title} starts in 15 minutes`,
      body: activity.place?.name ? `See you at ${activity.place.name}.` : 'Starting shortly.',
      linkUrl: `/events/${activity.event.slug}/programme/${activity.id}`,
      // Only the people who put it in their own programme (docs/11 §5).
      audience: { activityId: activity.id },
      channels: ['inapp', 'push'],
      timezone: activity.event.timezone,
    });
  }

  return { sent: upcoming.length };
}

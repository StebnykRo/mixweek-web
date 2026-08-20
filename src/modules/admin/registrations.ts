import type { RegistrationStatus } from '@prisma/client';
import { withTenant } from '@/lib/db/tenant-client';
import { notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { promoteFromWaitlist, renumberWaitlist } from '@/modules/registrations/service';
import { enqueueNotification } from '@/modules/notifications/dispatch';
import type { AdminActor } from './events';

/** docs/10-admin.md §3.5 — the registrations table, bulk actions and export. */

export type RegistrationFilters = {
  status?: RegistrationStatus;
  department?: string;
  q?: string;
  cursor?: string;
  limit: number;
};

export async function listRegistrations(tenantId: string, eventId: string, filters: RegistrationFilters) {
  return withTenant(tenantId, async (db) => {
    const rows = await db.eventRegistration.findMany({
      where: {
        eventId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.department || filters.q
          ? {
              user: {
                ...(filters.department ? { department: filters.department } : {}),
                ...(filters.q
                  ? {
                      OR: [
                        { name: { contains: filters.q, mode: 'insensitive' as const } },
                        { email: { contains: filters.q, mode: 'insensitive' as const } },
                      ],
                    }
                  : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        waitlistPosition: true,
        answers: true,
        checkedInAt: true,
        checkInMode: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, department: true, team: true } },
      },
    });

    const page = rows.slice(0, filters.limit);
    return {
      items: page,
      nextCursor: rows.length > filters.limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  });
}

export async function registrationSummary(tenantId: string, eventId: string) {
  return withTenant(tenantId, async (db) => {
    const [byStatus, checkedIn, capacity] = await Promise.all([
      db.eventRegistration.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
      db.eventRegistration.count({ where: { eventId, checkedInAt: { not: null } } }),
      db.event.findFirst({ where: { id: eventId }, select: { capacity: true } }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      checkedIn,
      capacity: capacity?.capacity ?? null,
    };
  });
}

export type BulkAction = 'approve' | 'decline' | 'promote';

/** docs/10 §3.5 — approving, declining and promoting, with a notification each. */
export async function bulkUpdate(
  tenantId: string,
  eventId: string,
  registrationIds: string[],
  action: BulkAction,
  actor: AdminActor,
) {
  const affected = await withTenant(tenantId, async (db) => {
    const event = await db.event.findFirst({
      where: { id: eventId },
      select: { id: true, slug: true, title: true, timezone: true, capacity: true },
    });
    if (!event) throw notFound({ eventId });

    await db.$executeRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;

    const registrations = await db.eventRegistration.findMany({
      where: { id: { in: registrationIds }, eventId },
      select: { id: true, userId: true, status: true },
    });

    const touched: Array<{ userId: string | null; status: RegistrationStatus }> = [];

    for (const registration of registrations) {
      if (action === 'approve' && registration.status === 'PENDING') {
        await db.eventRegistration.update({ where: { id: registration.id }, data: { status: 'CONFIRMED' } });
        touched.push({ userId: registration.userId, status: 'CONFIRMED' });
      }
      if (action === 'decline') {
        await db.eventRegistration.update({
          where: { id: registration.id },
          data: { status: 'DECLINED', waitlistPosition: null },
        });
        touched.push({ userId: registration.userId, status: 'DECLINED' });
      }
      if (action === 'promote' && registration.status === 'WAITLISTED') {
        await db.eventRegistration.update({
          where: { id: registration.id },
          data: { status: 'CONFIRMED', waitlistPosition: null },
        });
        touched.push({ userId: registration.userId, status: 'CONFIRMED' });
      }
    }

    await renumberWaitlist(db, event.id);
    if (action === 'decline') await promoteFromWaitlist(db, event.id, event.capacity);

    return { touched, event };
  });

  for (const entry of affected.touched) {
    if (!entry.userId) continue;
    await enqueueNotification({
      tenantId,
      eventId,
      kind: 'REGISTRATION',
      title: entry.status === 'CONFIRMED' ? 'Your place is confirmed' : 'Your registration was declined',
      body: `${affected.event.title}: ${entry.status === 'CONFIRMED' ? 'you are on the list.' : 'please contact the organisers if this is unexpected.'}`,
      linkUrl: `/events/${affected.event.slug}`,
      audience: { userIds: [entry.userId] },
      channels: ['inapp', 'push', 'email'],
      timezone: affected.event.timezone,
      actor,
    });
  }

  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: `registration.bulk_${action}`,
    entityType: 'Event',
    entityId: eventId,
    diff: { count: affected.touched.length },
  });

  return { updated: affected.touched.length };
}

/**
 * docs/10 §3.5 — the export contains personal data, so the act of exporting is
 * itself audited, and the answers are flattened rather than dumped as raw JSON.
 */
export async function exportRegistrationsCsv(tenantId: string, eventId: string, actor: AdminActor): Promise<string> {
  const rows = await withTenant(tenantId, (db) =>
    db.eventRegistration.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      select: {
        status: true,
        waitlistPosition: true,
        answers: true,
        checkedInAt: true,
        createdAt: true,
        user: { select: { name: true, email: true, department: true, team: true, jobTitle: true } },
      },
    }),
  );

  const answerKeys = [...new Set(rows.flatMap((row) => Object.keys((row.answers ?? {}) as object)))].sort();
  const header = [
    'email',
    'name',
    'jobTitle',
    'department',
    'team',
    'status',
    'waitlistPosition',
    'registeredAt',
    'checkedInAt',
    ...answerKeys,
  ];

  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const answers = (row.answers ?? {}) as Record<string, unknown>;
    lines.push(
      [
        row.user?.email ?? '',
        row.user?.name ?? '',
        row.user?.jobTitle ?? '',
        row.user?.department ?? '',
        row.user?.team ?? '',
        row.status,
        row.waitlistPosition ?? '',
        row.createdAt.toISOString(),
        row.checkedInAt?.toISOString() ?? '',
        ...answerKeys.map((key) => formatAnswer(answers[key])),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'registration.export',
    entityType: 'Event',
    entityId: eventId,
    diff: { rows: rows.length },
  });

  return lines.join('\n');
}

function formatAnswer(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join('; ');
  return String(value);
}

/**
 * Quotes every cell and neutralises a leading =, +, - or @ so a spreadsheet
 * cannot be tricked into treating exported text as a formula.
 */
function csvCell(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

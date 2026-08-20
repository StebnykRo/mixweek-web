import { route } from '@/lib/http/handler';
import { globalDb } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/hr-contact
 *
 * docs/10 §3.10 — resolution order: the personal hrContactId, then an
 * HrAssignment for department + team, then department alone, then the event's
 * HR contact.
 */
export const GET = route({ auth: { mode: 'session' }, limit: 'api.authenticated', personal: true }, async ({ session }) => {
  const tenantId = session.tenantId as string;

  const user = await globalDb.user.findUnique({
    where: { id: session.userId },
    select: { hrContactId: true, department: true, team: true },
  });

  if (user?.hrContactId) {
    const person = await globalDb.user.findUnique({
      where: { id: user.hrContactId },
      select: { id: true, name: true, email: true, jobTitle: true, avatarUrl: true },
    });
    if (person) return { source: 'personal', contact: person };
  }

  const assignment = await withTenant(tenantId, async (db) => {
    const exact = user?.department
      ? await db.hrAssignment.findFirst({
          where: { department: user.department, team: user.team ?? null },
          select: { hrUserId: true },
        })
      : null;
    if (exact) return exact;
    return user?.department
      ? db.hrAssignment.findFirst({ where: { department: user.department, team: null }, select: { hrUserId: true } })
      : null;
  });

  if (assignment) {
    const person = await globalDb.user.findUnique({
      where: { id: assignment.hrUserId },
      select: { id: true, name: true, email: true, jobTitle: true, avatarUrl: true },
    });
    if (person) return { source: 'assignment', contact: person };
  }

  const fallback = await withTenant(tenantId, (db) =>
    db.contact.findFirst({
      where: { kind: 'HR', deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, email: true, phone: true, role: true },
    }),
  );

  return { source: fallback ? 'event' : 'none', contact: fallback };
});

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/http/context';
import { errorResponse } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { can } from '@/modules/auth/policies';
import { CuidSchema } from '@/modules/events/schemas';
import { exportRegistrationsCsv } from '@/modules/admin/registrations';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/events/{id}/registrations/export
 *
 * docs/10-admin.md §3.5 — this is personal data leaving the system, so it needs
 * `registration.export:write`, which is a step-up action, and the export itself
 * is written to the audit log by the service.
 */
export async function POST(
  _request: Request,
  segment: { params: Promise<Record<string, string>> },
): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session?.tenantId) throw new AppError('UNAUTHENTICATED');
    if (!can(session, 'registration.export:write', { tenantId: session.tenantId })) {
      throw new AppError('STEP_UP_REQUIRED');
    }

    const params = await segment.params;
    const eventId = CuidSchema.parse(params.id);

    const csv = await exportRegistrationsCsv(session.tenantId, eventId, {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    });

    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="registrations-${eventId}.csv"`,
        'cache-control': 'private, no-store',
        vary: 'Cookie',
      },
    });
  } catch (error) {
    return errorResponse(error, 'export');
  }
}

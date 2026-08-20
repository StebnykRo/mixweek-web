import { NextResponse } from 'next/server';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { errorResponse } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { withTenant } from '@/lib/db/tenant-client';
import { SlugSchema } from '@/modules/events/schemas';
import { getMySchedule } from '@/modules/registrations/bookings';
import { buildIcs } from '@/modules/events/ics';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/events/{slug}/my-schedule.ics
 *
 * docs/06 §6 — .ics is how a personal schedule reaches a phone's calendar
 * without a native app, so this returns text/calendar rather than JSON.
 */
export async function GET(
  _request: Request,
  segment: { params: Promise<Record<string, string>> },
): Promise<NextResponse> {
  const requestId = 'ics';
  try {
    const session = await getSession();
    if (!session || !session.mfaSatisfied || !session.tenantId) throw new AppError('UNAUTHENTICATED');

    const params = await segment.params;
    const slug = SlugSchema.parse(params.slug);
    const event = await requireEvent(session.tenantId, slug);
    const schedule = await getMySchedule(session.tenantId, event.id, session.userId);

    const ids = [...new Set([...schedule.saved, ...schedule.booked, ...schedule.waitlisted, ...schedule.mandatory])];
    const activities = ids.length
      ? await withTenant(session.tenantId, (db) =>
          db.activity.findMany({
            where: { id: { in: ids }, deletedAt: null },
            orderBy: { startsAt: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              startsAt: true,
              endsAt: true,
              status: true,
              locationText: true,
              place: { select: { name: true } },
            },
          }),
        )
      : [];

    const ics = buildIcs(
      activities.map((activity) => ({
        uid: `${activity.id}@mixweek`,
        title: activity.title,
        description: activity.description,
        location: activity.place?.name ?? activity.locationText,
        startsAt: activity.startsAt,
        endsAt: activity.endsAt,
        url: `${env().APP_URL}/events/${event.slug}/programme/${activity.id}`,
        status: activity.status === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED',
      })),
      `${event.title} — my schedule`,
    );

    return new NextResponse(ics, {
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': `attachment; filename="${event.slug}-my-schedule.ics"`,
        'cache-control': 'private, no-store',
        vary: 'Cookie',
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
